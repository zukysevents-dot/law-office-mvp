import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { refreshSanctionsList } from "@/lib/sanctions/refresh";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron-triggered refresh of the local EU sanctions-list mirror. Bearer-auth with
// the same timing-safe pattern as the notifications cron, but a dedicated secret
// so the two schedules stay independent.
export async function POST(request: NextRequest) {
  const secret = process.env.SANCTIONS_REFRESH_SECRET?.trim();

  if (!secret || secret === "change-me-locally") {
    return NextResponse.json(
      { ok: false, error: "SANCTIONS_REFRESH_SECRET_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";

  if (!safeEqual(authorization, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await refreshSanctionsList();
  return NextResponse.json(
    { ok: result.status === "ok", result },
    { status: result.status === "ok" ? 200 : 502 },
  );
}
