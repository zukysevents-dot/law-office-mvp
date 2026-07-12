import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Front door for the whole app (Next 16 "proxy" convention, formerly
// middleware). Everything matched below requires a valid session cookie;
// without one the request is redirected to /login. The landing page (/),
// /login, /register, and /api/internal (own Bearer auth) are intentionally
// excluded from the matcher and stay public. /join-organization and /admin
// require a session but NOT an org membership (checked at the page level).
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = await verifySession(token);

  if (userId) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set(
    "from",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/subjects/:path*",
    "/conflict-check/:path*",
    "/registry/:path*",
    "/aml/:path*",
    "/projects/:path*",
    "/cases/:path*",
    "/tasks/:path*",
    "/work-logs/:path*",
    "/data-boxes/:path*",
    "/deadlines/:path*",
    "/billing/:path*",
    "/reports/:path*",
    "/references/:path*",
    "/calendar/:path*",
    "/documents/:path*",
    "/hr/:path*",
    "/audit-log/:path*",
    "/settings/:path*",
    "/join-organization/:path*",
    "/admin/:path*",
  ],
};
