import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "../../../../../lib/app-url";
import { getRequestUser } from "../../../../../lib/dashboard/server-auth";
import {
  allowedMarketplace,
  EBAY_OAUTH_COOKIE,
  encryptEbayToken,
  exchangeAuthorizationCode,
  ensureSellingPolicyManagement,
  fetchSellerUsername,
  verifyOAuthState,
} from "../../../../../lib/ebay/multi-store";
import { repricerAdmin } from "../../../../../lib/repricer/admin";

export const runtime = "nodejs";

function dashboardRedirect(request: NextRequest, message: string, storeId?: string, setupStatus?: string): NextResponse {
  const url = new URL("/dashboard", appUrl());
  url.searchParams.set("store_connection", message);
  if (storeId) url.searchParams.set("store_id", storeId);
  if (storeId) url.searchParams.set("store_connected", "true");
  if (setupStatus) url.searchParams.set("store_setup", setupStatus);
  const response = NextResponse.redirect(url);
  response.cookies.set(EBAY_OAUTH_COOKIE, "", { path: "/api/ebay", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state") || "";
  if (request.nextUrl.searchParams.has("error")) return dashboardRedirect(request, "cancelled");
  if (!code || !returnedState) return dashboardRedirect(request, "invalid");

  try {
    const signedState = request.cookies.get(EBAY_OAUTH_COOKIE)?.value || "";
    const separator = signedState.lastIndexOf(".");
    if (separator < 1) return dashboardRedirect(request, "invalid");
    const payload = signedState.slice(0, separator);
    const signature = signedState.slice(separator + 1);
    if (!verifyOAuthState(payload, signature)) return dashboardRedirect(request, "invalid");
    const stateData = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string; nonce?: string; marketplace?: string; createdAt?: number };
    const [marketplacePart, nonce] = returnedState.split(".", 2);
    if (!stateData.userId || !stateData.nonce || !stateData.createdAt || Date.now() - stateData.createdAt > 10 * 60_000 || nonce !== stateData.nonce) {
      return dashboardRedirect(request, "invalid");
    }
    const user = await getRequestUser();
    if (!user || user.id !== stateData.userId) return dashboardRedirect(request, "session");

    const marketplace = allowedMarketplace(marketplacePart);
    if (stateData.marketplace && stateData.marketplace !== marketplace) return dashboardRedirect(request, "invalid");
    const tokens = await exchangeAuthorizationCode(code);
    let policySnapshot: Awaited<ReturnType<typeof ensureSellingPolicyManagement>> | null = null;
    try {
      policySnapshot = await ensureSellingPolicyManagement(tokens.access_token, marketplace);
    } catch (setupCause) {
      console.warn("eBay store connected; automatic Business Policies setup needs attention:", setupCause instanceof Error ? setupCause.message : "unknown error");
    }
    const sellerUsername = await fetchSellerUsername(tokens.access_token);
    const storeName = sellerUsername || `eBay ${marketplace.replace("EBAY_", "")}`;
    const admin = repricerAdmin();
    const record = {
      user_id: user.id,
      store_name: storeName,
      seller_username: sellerUsername,
      marketplace_id: marketplace,
      access_token: encryptEbayToken(tokens.access_token),
      refresh_token: encryptEbayToken(tokens.refresh_token || ""),
      token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 7200) * 1000).toISOString(),
      refresh_token_expires_at: tokens.refresh_token_expires_in
        ? new Date(Date.now() + Number(tokens.refresh_token_expires_in) * 1000).toISOString()
        : null,
      status: "active",
    };

    let connectedStoreId: string | undefined;
    if (sellerUsername) {
      const { data: existing, error: lookupError } = await admin.from("ebay_stores")
        .select("id")
        .eq("user_id", user.id)
        .eq("marketplace_id", marketplace)
        .ilike("seller_username", sellerUsername)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        const { error } = await admin.from("ebay_stores").update(record).eq("id", existing.id).eq("user_id", user.id);
        if (error) throw error;
        connectedStoreId = existing.id;
      } else {
        const { data: inserted, error } = await admin.from("ebay_stores").insert(record).select("id").single();
        if (error) throw error;
        connectedStoreId = inserted.id;
      }
    } else {
      const { data: inserted, error } = await admin.from("ebay_stores").insert(record).select("id").single();
      if (error) throw error;
      connectedStoreId = inserted.id;
    }
    if (connectedStoreId && policySnapshot) {
      const uniqueDefaults = [
        ["fulfillment_policy_id", policySnapshot.fulfillmentPolicies, "fulfillmentPolicyId"],
        ["payment_policy_id", policySnapshot.paymentPolicies, "paymentPolicyId"],
        ["return_policy_id", policySnapshot.returnPolicies, "returnPolicyId"],
      ] as const;
      for (const [column, policies, idKey] of uniqueDefaults) {
        if (policies.length !== 1) continue;
        const policyId = String(policies[0][idKey] || "").trim();
        if (!policyId) continue;
        const { error } = await admin.from("ebay_stores").update({ [column]: policyId, updated_at: new Date().toISOString() })
          .eq("id", connectedStoreId).eq("user_id", user.id).is(column, null);
        if (error) console.warn(`eBay ${column} default could not be saved:`, error.message);
      }
    }
    const policyCounts = policySnapshot && [policySnapshot.fulfillmentPolicies, policySnapshot.paymentPolicies, policySnapshot.returnPolicies];
    const setupStatus = policySnapshot
      ? (policyCounts?.every((policies) => policies.length > 0) ? "ready" : "policies_needed")
      : "check_failed";
    return dashboardRedirect(request, "connected", connectedStoreId, setupStatus);
  } catch (cause) {
    console.error("eBay store OAuth callback failed:", cause instanceof Error ? cause.message : "unknown error");
    return dashboardRedirect(request, "failed");
  }
}

export async function POST(request: NextRequest) {
  // The signed, user-bound cookie remains mandatory even for pasted codes.
  try {
    const body = await request.json() as { callback?: unknown; code?: unknown; state?: unknown };
    const input = String(body.callback || "").trim();
    const providedCode = String(body.code || "").trim();
    if ((!input && !providedCode) || input.length > 16000 || providedCode.length > 4096) return NextResponse.json({ error: "Geçerli onay kodu veya callback URL gerekli." }, { status: 400 });
    const signed = request.cookies.get(EBAY_OAUTH_COOKIE)?.value || "";
    const separator = signed.lastIndexOf(".");
    if (separator < 1 || !verifyOAuthState(signed.slice(0, separator), signed.slice(separator + 1))) return NextResponse.json({ error: "Önce eBay bağlantısını bu tarayıcıda başlatın." }, { status: 400 });
    const state = JSON.parse(Buffer.from(signed.slice(0, separator), "base64url").toString("utf8"));
    const target = new URL("/api/ebay/oauth/callback", appUrl());
    if (providedCode) {
      target.searchParams.set("code", providedCode);
      target.searchParams.set("state", String(body.state || `${state.marketplace || "EBAY_DE"}.${state.nonce}`));
    } else if (/^https?:\/\//i.test(input)) {
      const pasted = new URL(input);
      target.searchParams.set("code", pasted.searchParams.get("code") || "");
      target.searchParams.set("state", pasted.searchParams.get("state") || "");
    } else {
      target.searchParams.set("code", input);
      target.searchParams.set("state", `${state.marketplace || "EBAY_DE"}.${state.nonce}`);
    }
    const response = await GET(new NextRequest(target, { headers: request.headers }));
    const location = response.headers.get("location") || "";
    const success = new URL(location).searchParams.get("store_connected") === "true";
    const result = NextResponse.json(success ? { connected: true, redirect: location } : { error: "eBay bağlantısı tamamlanamadı. Yeni bir onay koduyla tekrar deneyin." }, { status: success ? 200 : 400 });
    if (success) result.cookies.set(EBAY_OAUTH_COOKIE, "", { path: "/api/ebay", maxAge: 0 });
    return result;
  } catch { return NextResponse.json({ error: "Callback URL veya onay kodu geçersiz." }, { status: 400 }); }
}
