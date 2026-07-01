import { NextResponse, type NextRequest } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { runScheduledNotifications } from "@/lib/notifications/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  return NextResponse.json({ ok: true, result });
}

// Vercel Cron triggers the path with a GET (carrying the CRON_SECRET bearer);
// delegate to the same authenticated handler.
export async function GET(request: NextRequest) {
  return POST(request);
}
