import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { isLandingOnlyHost } from "@/lib/landing-mode";

// Front door for the whole app (Next 16 "proxy" convention, formerly
// middleware).
//
// 1) Public-launch gate: hosts listed in LANDING_ONLY_HOSTS serve ONLY the
//    landing page — every matched path (incl. /login and /register) redirects
//    to "/". The internal app stays reachable on hosts not listed there.
//    See src/lib/landing-mode.ts.
// 2) Session gate: app paths require a valid session cookie; without one the
//    request is redirected to /login. The landing page (/), /login, /register,
//    /verify-email, /portal (own magic-link auth) and /api/internal (own
//    Bearer auth) are public. /join-organization and /admin require a session
//    but NOT an org membership (checked at the page level).
export async function proxy(request: NextRequest) {
  // The matcher never matches "/" itself, so on landing-only hosts everything
  // that reaches the proxy goes back to the landing page.
  if (isLandingOnlyHost(request.headers.get("host"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (/^\/(login|register|verify-email|portal)(\/|$)/.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

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
    // Public auth/portal pages — matched only so the landing-only host gate
    // can lock them; for normal hosts the proxy lets them straight through.
    "/login/:path*",
    "/register/:path*",
    "/verify-email/:path*",
    "/portal/:path*",
  ],
};
