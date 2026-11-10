import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "../../../../../lib/app-url";
import { getRequestUser } from "../../../../../lib/dashboard/server-auth";
import { allowedMarketplace, createEbayAuthorizationUrl, createOAuthNonce, EBAY_OAUTH_COOKIE, signOAuthState } from "../../../../../lib/ebay/multi-store";

export const runtime = "nodejs";

async function connect(request: NextRequest, bodyMarketplace?: unknown) {
  const user = await getRequestUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=%2Fdashboard", appUrl()));
  try {
    const requestedMarketplace = request.nextUrl.searchParams.get("marketplace") || (typeof bodyMarketplace === "string" ? bodyMarketplace : null);
    const marketplace = allowedMarketplace(requestedMarketplace);
    const nonce = createOAuthNonce();
    const payload = Buffer.from(JSON.stringify({ userId: user.id, nonce, marketplace, createdAt: Date.now() })).toString("base64url");
    const signature = signOAuthState(payload);
    const authUrl = createEbayAuthorizationUrl(nonce, marketplace);
    const json = request.nextUrl.searchParams.get("json") === "true" || request.nextUrl.searchParams.get("format") === "json";
    const response = json
      ? NextResponse.json({ authUrl, authorizationUrl: authUrl })
      : NextResponse.redirect(authUrl);
    response.cookies.set(EBAY_OAUTH_COOKIE, `${payload}.${signature}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/ebay",
      maxAge: 10 * 60,
    });
    return response;
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay bağlantısı başlatılamadı." }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  return connect(request);
}

export async function POST(request: NextRequest) {
  let marketplace: unknown;
  try {
    const body = await request.json() as { marketplace?: unknown };
    marketplace = body.marketplace;
  } catch {
    // POST without a JSON body still follows the safe GET behavior.
  }
  return connect(request, marketplace);
}
