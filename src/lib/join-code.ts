import { createHmac, randomInt } from "node:crypto";

// Registration/join codes. They are high-entropy values WE generate, so a fast
// keyed hash (HMAC-SHA256) is the right tool — unlike passwords, no per-row salt
// is needed and a deterministic hash lets us look a code up by equality.
// ponytail: HMAC over SESSION_SECRET, not scrypt — entropy is in the code itself.

// Crockford-ish base32 without easily-confused chars (no I, L, O, U, 0, 1).
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const GROUPS = 3;
const GROUP_LEN = 4;

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value && value.length >= 32) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to a random value of at least 32 characters in production.",
    );
  }
  // ponytail: dev-only fallback, mirrors src/lib/session.ts; prod throws above.
  return "dev-insecure-session-secret-change-me-32+";
}

// Strip formatting and upper-case so "abcd efgh-jklm" == "ABCD-EFGH-JKLM".
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Group a normalized code into ABCD-EFGH-JKLM for display.
export function formatCode(code: string): string {
  return (
    normalizeCode(code)
      .match(/.{1,4}/g)
      ?.join("-") ?? code
  );
}

// A fresh code in display form. crypto.randomInt is rejection-sampled (uniform).
export function generateCode(): string {
  let raw = "";
  for (let i = 0; i < GROUPS * GROUP_LEN; i++) {
    raw += ALPHABET[randomInt(ALPHABET.length)];
  }
  return formatCode(raw);
}

export function hashCode(code: string): string {
  return createHmac("sha256", secret()).update(normalizeCode(code)).digest("hex");
}
