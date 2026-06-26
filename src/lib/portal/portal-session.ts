import { createHmac, timingSafeEqual } from "node:crypto";

// Client-portal session cookie — SEPARATE from the internal session (different
// cookie name + secret + namespace). The cookie carries a signed reference to a
// PortalSession DB row (`${sessionId}.${exp}.${sig}`); the DB row is the
// authority, so a revoked/expired/deleted row invalidates the cookie. Node
// crypto only — the portal runs in RSC/server actions, not edge.

export const PORTAL_SESSION_COOKIE = "portal_session";

function secret(): string {
  const value = process.env.PORTAL_SESSION_SECRET?.trim();
  if (value && value.length >= 32) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PORTAL_SESSION_SECRET must be set to a random value of at least 32 characters in production.",
    );
  }
  return "dev-insecure-portal-secret-change-me-32+chars";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signPortalSession(sessionId: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${sessionId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

// Returns the sessionId when the signature + expiry are valid, else null
// (fail-closed). Caller MUST still load the PortalSession row to authorize.
export function verifyPortalSession(
  token: string | undefined | null,
): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [sessionId, expString, sig] = parts;
  if (!sessionId || !expString || !sig) return null;

  const expected = sign(`${sessionId}.${expString}`);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  const exp = Number(expString);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return null;
  }

  return sessionId;
}
