import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  // Supabase returns the OAuth authorization code to redirectTo. Exchange it
  // before checking dashboard access so the same response can set the session
  // cookies that the dashboard server component reads.
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.pathname.startsWith("/dashboard") && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL("/login?oauth=callback_failed", request.nextUrl.origin),
      );
    }

    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("code");
    const redirect = NextResponse.redirect(cleanUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (request.nextUrl.pathname.startsWith("/dashboard") && !claims) {
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", request.nextUrl.pathname); return NextResponse.redirect(url);
  }
  return response;
}

export const config = { matcher: ["/dashboard/:path*"] };
