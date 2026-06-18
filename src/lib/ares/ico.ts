/**
 * Pure helpers for Czech IČO (no I/O).
 *
 * A Czech IČO is canonically 8 digits, zero-padded, with a mod-11 check digit.
 * Stored `Subject.ico` values are free-form, so normalize before any ARES call
 * or `where: { ico }` lookup.
 */

/**
 * Strip non-digits and left-pad to 8. Returns null for empty input or anything
 * longer than 8 digits (not a valid IČO).
 */
export function normalizeIco(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 8) {
    return null;
  }

  return digits.padStart(8, "0");
}

/**
 * Standard Czech IČO mod-11 checksum on a normalized (8-digit) value. Used as a
 * soft pre-filter to skip an obviously-pointless network call — ARES stays the
 * source of truth.
 */
export function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) {
    return false;
  }

  const digits = [...ico].map(Number);
  let sum = 0;
  for (let i = 0; i < 7; i += 1) {
    sum += digits[i] * (8 - i);
  }

  const check = (11 - (sum % 11)) % 10;
  return check === digits[7];
}
