import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../../../lib/dashboard/server-auth";
import { allowedMarketplace, createEbayAuthorizationUrl, createOAuthNonce, EBAY_OAUTH_COOKIE, signOAuthState } from "../../../../../lib/ebay/multi-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=%2Fdashboard", request.url));
  try {
    const marketplace = allowedMarketplace(request.nextUrl.searchParams.get("marketplace"));
    const nonce = createOAuthNonce();
    const payload = Buffer.from(JSON.stringify({ userId: user.id, nonce, createdAt: Date.now() })).toString("base64url");
    const signature = signOAuthState(payload);
    const response = NextResponse.redirect(createEbayAuthorizationUrl(nonce, marketplace));
    response.cookies.set(EBAY_OAUTH_COOKIE, `${payload}.${signature}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/ebay/stores/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay bağlantısı başlatılamadı." }, { status: 503 });
  }
}
