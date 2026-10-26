import { NextResponse, type NextRequest } from "next/server";

import { refreshStaleOutlookFeeds } from "@/lib/calendar/outlook-feed.server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { runScheduledNotifications } from "@/lib/notifications/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Outlook feeds are downloaded here too (each ≤ 10 s, a few in parallel).
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = authorizeCronRequest(request.headers.get("authorization") ?? "");
  if (auth === "not_configured") {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await runScheduledNotifications();
  // Hourly (VPS) / daily (Vercel) refresh of personal Outlook calendars, so
  // the cache is warm when someone opens the calendar. Never fails the run.
  const calendar = await refreshStaleOutlookFeeds().catch(() => ({ error: true }));
  return NextResponse.json({ ok: true, result, calendar });
}

// Vercel Cron triggers the path with a GET (carrying the CRON_SECRET bearer);
// delegate to the same authenticated handler.
export async function GET(request: NextRequest) {
  return POST(request);
}
