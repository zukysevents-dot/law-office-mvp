import { createHmac, randomBytes } from "node:crypto";

export const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to issue e-mail verification tokens.",
    );
  }
  return "dev-insecure-session-secret-change-me-32+";
}

export function generateEmailVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashEmailVerificationToken(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export function emailVerificationUrl(token: string): string {
  const baseUrl = process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3001";
  return `${baseUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
}
