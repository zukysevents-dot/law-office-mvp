import { createHmac, randomBytes } from "node:crypto";

import { appUrl } from "@/lib/mail/mailer";

// One-time "set your own password" links sent in the welcome invitation.
// Only an HMAC of the token is stored (userInvitationTokens.tokenHash); the
// plaintext exists solely in the e-mail. Rotating SESSION_SECRET invalidates
// every outstanding link (documented in deploy/DEPLOY.md).

export const INVITATION_TTL_HOURS = 72;
export const INVITATION_RESEND_DEDUPE_MS = 60 * 1000;

function tokenSecret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set to protect invitation links.");
  }
  return "dev-insecure-session-secret-change-me-32+";
}

/** 32 random bytes, base64url (43 chars, URL-safe, no padding). */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHmac("sha256", tokenSecret())
    .update(`invite:${token}`)
    .digest("hex");
}

/** Cheap shape check before touching the DB with an attacker-supplied value. */
export function isWellFormedInvitationToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

export function invitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
}

export type InvitationTokenState = {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
};

export function isInvitationUsable(
  row: InvitationTokenState | null | undefined,
  now: Date = new Date(),
): boolean {
  return Boolean(
    row && !row.usedAt && !row.revokedAt && row.expiresAt.getTime() > now.getTime(),
  );
}

/** True while the previously SENT invitation for the user is younger than 60 s. */
export function isWithinInvitationResendDedupe(
  lastSentAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return Boolean(
    lastSentAt &&
      now.getTime() - lastSentAt.getTime() < INVITATION_RESEND_DEDUPE_MS,
  );
}

export function setPasswordUrl(token: string): string {
  return appUrl(`/set-password?token=${encodeURIComponent(token)}`);
}
