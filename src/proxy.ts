import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Front door for the whole app (Next 16 "proxy" convention, formerly
// middleware). Everything matched below requires a valid session cookie;
// without one the request is redirected to /login. The landing page (/),
// /login, and /api/internal (own Bearer auth) are intentionally excluded from
// the matcher and stay public.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = await verifySession(token);

  if (userId) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?from=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/subjects/:path*",
    "/conflict-check/:path*",
    "/projects/:path*",
    "/cases/:path*",
    "/tasks/:path*",
    "/work-logs/:path*",
    "/billing/:path*",
    "/reports/:path*",
    "/references/:path*",
    "/calendar/:path*",
    "/audit-log/:path*",
    "/settings/:path*",
  ],
};
