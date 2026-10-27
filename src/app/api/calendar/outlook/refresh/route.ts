import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  getOutlookFeedSummary,
  refreshOwnOutlookFeed,
} from "@/lib/calendar/outlook-feed.server";
import type { OutlookRefreshResponse } from "@/lib/calendar/outlook-summary";
import { assertCanAccessModule } from "@/lib/module-access.server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Refresh of the caller's OWN Outlook (ICS) feed. Deliberately a Route
// Handler, not a server action: Next runs one client's server actions strictly
// one after another, so an ICS download (up to 10 s) started as an action
// would hold back every calendar event fetch (deadlines, hearings, tasks)
// queued behind it. A plain fetch() runs in parallel.
//
// /api is outside the proxy's session gate, so the session is checked here.
// Same-origin only (the session cookie is SameSite=Lax anyway); the body
// carries no URL — only the caller's own feed (userId + organizationId of the
// session) is ever touched.

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return false;
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return json({ error: "FORBIDDEN" }, 403);
  }
  const userId = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const currentUser = await getCurrentUser();
  try {
    await assertCanAccessModule(currentUser, "module.calendar");
  } catch {
    return json({ error: "FORBIDDEN" }, 403);
  }
  if (!currentUser.organizationId) {
    return json({ error: "FORBIDDEN" }, 403);
  }

  let force = false;
  try {
    const body = (await request.json()) as { force?: unknown } | null;
    force = body?.force === true;
  } catch {
    // No / invalid body → background refresh.
  }

  const outcome = await refreshOwnOutlookFeed(currentUser, { force });
  const summary = await getOutlookFeedSummary(currentUser);
  const response: OutlookRefreshResponse = { outcome, summary };
  return json(response);
}
