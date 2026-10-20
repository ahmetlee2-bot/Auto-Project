import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../../../lib/dashboard/server-auth";
import {
  allowedMarketplace,
  EBAY_OAUTH_COOKIE,
  encryptEbayToken,
  exchangeAuthorizationCode,
  fetchSellerUsername,
  verifyOAuthState,
} from "../../../../../lib/ebay/multi-store";
import { repricerAdmin } from "../../../../../lib/repricer/admin";

export const runtime = "nodejs";

function dashboardRedirect(request: NextRequest, message: string, storeId?: string): NextResponse {
  const url = new URL("/dashboard", request.url);
  url.searchParams.set("store_connection", message);
  if (storeId) url.searchParams.set("store_id", storeId);
  const response = NextResponse.redirect(url);
  response.cookies.delete(EBAY_OAUTH_COOKIE);
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
    const stateData = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string; nonce?: string; createdAt?: number };
    const [marketplacePart, nonce] = returnedState.split(".", 2);
    if (!stateData.userId || !stateData.nonce || !stateData.createdAt || Date.now() - stateData.createdAt > 10 * 60_000 || nonce !== stateData.nonce) {
      return dashboardRedirect(request, "invalid");
    }
    const user = await getRequestUser();
    if (!user || user.id !== stateData.userId) return dashboardRedirect(request, "session");

    const marketplace = allowedMarketplace(marketplacePart);
    const tokens = await exchangeAuthorizationCode(code);
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
    return dashboardRedirect(request, "connected", connectedStoreId);
  } catch (cause) {
    console.error("eBay store OAuth callback failed:", cause instanceof Error ? cause.message : "unknown error");
    return dashboardRedirect(request, "failed");
  }
}
