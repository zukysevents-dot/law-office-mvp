/**
 * Czech birth number (rodné číslo) — the single place that parses, validates
 * and masks it. RČ is sensitive personal data: the full value is shown only on
 * the subject detail / edit page to users who may see the subject; lists,
 * search snippets, the conflict check and the audit log use `maskBirthNumber`.
 * A later switch to at-rest encryption stays local to this module.
 *
 * Validation is deliberately lenient: an RČ with a bad checksum or date can
 * still be stored (real-world numbers issued before 1985 and foreigners'
 * numbers do not always follow the rules) — the form only warns. Only a value
 * that is not 9–10 digits at all is rejected.
 */

export type BirthNumberParse =
  | { ok: false }
  | {
      ok: true;
      /** "YYMMDD/XXXX" (or "YYMMDD/XXX" for 9-digit pre-1954 numbers). */
      normalized: string;
      checksumValid: boolean;
      dateValid: boolean;
      /** UTC midnight of the encoded birth date, when the date is valid. */
      birthDate: Date | null;
    };

const SHAPE = /^(\d{6})\/?(\d{3,4})$/;

/** HTML `pattern` for the form input (same shape the server accepts). */
export const BIRTH_NUMBER_INPUT_PATTERN = "\\s*\\d{6}\\s*/?\\s*\\d{3,4}\\s*";

export function parseBirthNumber(
  raw: string | null | undefined,
  now: Date = new Date(),
): BirthNumberParse | null {
  const compact = (raw ?? "").replace(/\s+/g, "");
  if (!compact) {
    return null;
  }

  const match = SHAPE.exec(compact);
  if (!match) {
    return { ok: false };
  }

  const [, head, tail] = match;
  const digits = `${head}${tail}`;
  const yy = Number(head.slice(0, 2));
  let mm = Number(head.slice(2, 4));
  const dd = Number(head.slice(4, 6));

  // Women: +50; since 2004 the month may also carry +20 (men) / +70 (women).
  if (mm > 70) mm -= 70;
  else if (mm > 50) mm -= 50;
  else if (mm > 20) mm -= 20;

  let year: number;
  let checksumValid: boolean;
  if (digits.length === 9) {
    // 9-digit numbers were issued only before 1954 and carry no checksum.
    year = 1900 + yy;
    checksumValid = yy < 54;
  } else {
    year = yy >= 54 ? 1900 + yy : 2000 + yy;
    const value = Number(digits);
    const first9 = Number(digits.slice(0, 9));
    checksumValid =
      value % 11 === 0 || (first9 % 11 === 10 && digits.endsWith("0"));
  }

  const date = new Date(Date.UTC(year, mm - 1, dd));
  const dateValid =
    mm >= 1 &&
    mm <= 12 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === mm - 1 &&
    date.getUTCDate() === dd &&
    date.getTime() <= now.getTime();

  return {
    ok: true,
    normalized: `${head}/${tail}`,
    checksumValid,
    dateValid,
    birthDate: dateValid ? date : null,
  };
}

/** "800101/0006" → "••••••/••06". Anything unparseable is fully masked. */
export function maskBirthNumber(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const compact = value.replace(/\s+/g, "");
  const match = SHAPE.exec(compact);
  if (!match) {
    return "••••••/••••";
  }
  const tail = match[2];
  return `••••••/${"•".repeat(tail.length - 2)}${tail.slice(-2)}`;
}

/**
 * Normalized RČ for an exact-match search, or null when the query does not
 * look like a birth number. Partial RČ search is intentionally not supported
 * (it would turn the search box into an RČ-guessing oracle).
 */
export function birthNumberSearchKey(query: string): string | null {
  const parsed = parseBirthNumber(query);
  return parsed?.ok ? parsed.normalized : null;
}
