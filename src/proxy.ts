import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { isLandingOnlyHost } from "@/lib/landing-mode";

// Paths that are public on normal hosts: the auth pages and the client portal
// (it has its own magic-link auth). Everything else the matcher lets through
// requires a session.
const PUBLIC_PATHS = /^\/(login|register|verify-email|portal)(\/|$)/;

// Front door for the whole app (Next 16 "proxy" convention, formerly
// middleware).
//
// 1) Public-launch gate: hosts listed in LANDING_ONLY_HOSTS serve ONLY the
//    landing page — every matched path (incl. /login and /register) 303s
//    to "/". The internal app stays reachable on hosts not listed there.
//    /api/internal is intentionally exempt (own Bearer auth; cron needs it).
//    See src/lib/landing-mode.ts.
// 2) Session gate: everything matched except PUBLIC_PATHS requires a valid
//    session cookie; without one the request is redirected to /login.
//    /join-organization and /admin require a session but NOT an org
//    membership (checked at the page level).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    return NextResponse.next();
  }

  if (
    isLandingOnlyHost(
      request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    )
  ) {
    // 303: a stray POST (e.g. a replayed server action) must not re-play
    // its body against the landing page.
    return NextResponse.redirect(new URL("/", request.url), 303);
  }

  if (PUBLIC_PATHS.test(pathname)) {
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
  // Negative matcher: every route is behind the front door BY DEFAULT — a
  // newly added app route is session-gated without touching this file.
  // Excluded: Next internals, /api (only /api/internal exists; Bearer-auth),
  // and static files (anything with a file extension).
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
