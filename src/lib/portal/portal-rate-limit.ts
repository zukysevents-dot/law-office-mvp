import { headers } from "next/headers";

import { getPrisma } from "@/lib/prisma";

// Coarse, IP-keyed throttle for the portal magic-link endpoint. Deliberately
// looser than the per-account cap (recent tokens per PortalAccess): one IP may
// legitimately sit behind a NAT/CGNAT shared by several clients, yet this still
// blunts enumeration/spam of many e-mails or orgs from a single origin. Tune the
// max if a busy shared origin trips it.
export const PORTAL_IP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const PORTAL_IP_RATE_LIMIT_MAX = 10;

// Sentinel bucket for requests that carry no proxy IP header (e.g. local dev).
// Such requests are still counted (under one shared bucket) rather than left
// completely un-limited.
export const UNKNOWN_IP = "unknown";

// Pure (no I/O): pick the client IP from proxy headers. `x-forwarded-for` is a
// comma-separated chain "client, proxy1, proxy2" — the first hop is the original
// client. Falls back to `x-real-ip`, then UNKNOWN_IP.
export function parseClientIp(
  forwardedFor: string | null,
  realIp: string | null,
): string {
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = realIp?.trim();
  if (real) return real;
  return UNKNOWN_IP;
}

// Resolve the caller's IP from the incoming request headers (server action /
// RSC context). Use `parseClientIp` directly when you already hold a `Request`.
export async function getRequestIp(): Promise<string> {
  const h = await headers();
  return parseClientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
}

// Records THIS attempt and reports whether the IP is still within its window
// budget. Recording happens for every call (including blocked ones) so sustained
// abuse keeps the window saturated and the IP stays blocked. Throws on DB
// failure — the caller owns the fail-open/closed decision.
export async function recordPortalLoginAttempt(ip: string): Promise<boolean> {
  const prisma = getPrisma();
  const windowStart = new Date(Date.now() - PORTAL_IP_RATE_LIMIT_WINDOW_MS);

  await prisma.portalLoginAttempt.create({ data: { ipAddress: ip } });

  const recent = await prisma.portalLoginAttempt.count({
    where: { ipAddress: ip, createdAt: { gt: windowStart } },
  });

  // Best-effort prune of this IP's expired rows so the ledger stays bounded.
  // Non-critical: a failure here must not affect the rate-limit decision.
  try {
    await prisma.portalLoginAttempt.deleteMany({
      where: { ipAddress: ip, createdAt: { lt: windowStart } },
    });
  } catch {
    // ignore — pruning is housekeeping, not correctness
  }

  return recent <= PORTAL_IP_RATE_LIMIT_MAX;
}
