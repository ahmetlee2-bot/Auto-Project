import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => { request.cookies.set(name, value); response = NextResponse.next({ request }); response.cookies.set(name, value, options); }) } },
  );
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  // Supabase returns the OAuth authorization code to redirectTo. Exchange it
  // in middleware before protecting /dashboard, then remove it from the URL.
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.pathname.startsWith("/dashboard") && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.searchParams.delete("code");
      const redirect = NextResponse.redirect(cleanUrl);
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
  }

  if (request.nextUrl.pathname.startsWith("/dashboard") && !claims) {
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", request.nextUrl.pathname); return NextResponse.redirect(url);
  }
  return response;
}

export const config = { matcher: ["/dashboard/:path*"] };
