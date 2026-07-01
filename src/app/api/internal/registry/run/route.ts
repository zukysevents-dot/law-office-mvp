import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { runRegistryChecks } from "@/lib/registry/registry-monitor-service";

// Reuses NOTIFICATION_RUN_SECRET — the same trusted cron caller drives both the
// notification and registry-monitoring runs.
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ARES is sequential + rate-limited; a capped batch (see DEFAULT_CHECK_LIMIT)
// can take minutes in the worst case. Give the function room; run the cron often
// enough that the oldest-checked-first rotation covers everyone.
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const secret = process.env.NOTIFICATION_RUN_SECRET?.trim();

  if (!secret || secret === "change-me-locally") {
    return NextResponse.json(
      { ok: false, error: "NOTIFICATION_RUN_SECRET_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!safeEqual(authorization, `Bearer ${secret}`)) {
    return unauthorized();
  }

  const result = await runRegistryChecks();
  return NextResponse.json({ ok: true, result });
}

// Vercel Cron triggers the path with a GET (carrying the CRON_SECRET bearer);
// delegate to the same authenticated handler.
export async function GET(request: NextRequest) {
  return POST(request);
}
