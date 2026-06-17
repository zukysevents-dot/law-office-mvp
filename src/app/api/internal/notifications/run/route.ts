import { NextResponse, type NextRequest } from "next/server";

import { runScheduledNotifications } from "@/lib/notifications/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "UNAUTHORIZED" },
    { status: 401 },
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.NOTIFICATION_RUN_SECRET?.trim();

  if (!secret || secret === "change-me-locally") {
    return NextResponse.json(
      { ok: false, error: "NOTIFICATION_RUN_SECRET_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const result = await runScheduledNotifications();

  return NextResponse.json({ ok: true, result });
}
