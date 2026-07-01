import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export type CronAuthResult = "ok" | "not_configured" | "unauthorized";

/**
 * Authorize an internal cron request. Accepts a Bearer token matching EITHER
 * `CRON_SECRET` (what Vercel Cron sends automatically) OR `NOTIFICATION_RUN_SECRET`
 * (manual / external callers). This avoids Vercel's "Sensitive" env vars being
 * unreadable: the operator just sets a fresh CRON_SECRET, no value copying.
 * "not_configured" when neither secret is set (or left at the placeholder).
 */
export function authorizeCronRequest(authorization: string): CronAuthResult {
  const secrets = [process.env.CRON_SECRET, process.env.NOTIFICATION_RUN_SECRET]
    .map((secret) => secret?.trim())
    .filter(
      (secret): secret is string =>
        Boolean(secret) && secret !== "change-me-locally",
    );

  if (secrets.length === 0) {
    return "not_configured";
  }
  return secrets.some((secret) => safeEqual(authorization, `Bearer ${secret}`))
    ? "ok"
    : "unauthorized";
}
