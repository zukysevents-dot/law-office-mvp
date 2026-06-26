import { createHmac, randomBytes } from "node:crypto";

// Magic-link tokens for the client portal (F6). The token is a high-entropy
// value WE generate, so a fast keyed hash (HMAC-SHA256) is correct — like join
// codes (join-code.ts), and unlike passwords (no per-row salt; deterministic
// hash enables an equality lookup). Only the hash is stored; the plaintext lives
// only in the e-mailed URL.

// Magic link: short-lived + single-use. Client session: short, no sliding (MVP).
export const PORTAL_LINK_TTL_SECONDS = 15 * 60;
export const PORTAL_SESSION_TTL_SECONDS = 30 * 60;

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
  // dev-only fallback so the portal works without setup; prod throws above.
  return "dev-insecure-portal-secret-change-me-32+chars";
}

// 32 random bytes = 256 bits of entropy, URL-safe.
export function generatePortalToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPortalToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}
