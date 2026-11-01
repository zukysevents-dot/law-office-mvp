/**
 * Contact channels of a subject (SubjectContact): several e-mails, phones,
 * data boxes, webs. Pure helpers shared by the form parser, the detail page,
 * search and billing. The primary e-mail is mirrored into the legacy
 * `Subject.email` column (billing, portal, notifications and exports read it).
 */

import { SubjectContactType } from "@/generated/prisma/enums";
import { isValidEmail } from "@/lib/invoice-email";
import { isSafeHttpUrl } from "@/lib/utils";

export const MAX_CONTACT_VALUE_LENGTH = 320;
export const MAX_CONTACT_LABEL_LENGTH = 100;
export const MAX_SUBJECT_CONTACTS = 50;

export type ContactRow = {
  /** Existing row id (edit) or null for a new row. */
  id: string | null;
  type: SubjectContactType;
  value: string;
  valueNormalized: string;
  label: string | null;
  isPrimary: boolean;
  position: number;
};

export type ContactLike = {
  id?: string | null;
  type: SubjectContactType | string;
  value: string;
  label?: string | null;
  isPrimary: boolean;
};

const PHONE_RE = /^\+?[0-9\s()./-]{6,25}$/;

/** Search key: e-mail/data box/web lower-case, phone digits only. */
export function normalizeContactValue(
  type: SubjectContactType | string,
  value: string,
): string {
  const trimmed = value.trim();
  if (type === SubjectContactType.PHONE) {
    return trimmed.replace(/\D/g, "");
  }
  return trimmed.toLowerCase();
}

/**
 * Validates and canonicalizes one contact value. Returns the value to store or
 * null when it is invalid. Data boxes are not shape-checked (ISDS ids vary;
 * the ISDS module validates on use).
 */
export function validateContactValue(
  type: SubjectContactType | string,
  raw: string,
): string | null {
  const value = raw.trim();
  if (!value || value.length > MAX_CONTACT_VALUE_LENGTH) {
    return null;
  }
  switch (type) {
    case SubjectContactType.EMAIL:
      return isValidEmail(value) ? value : null;
    case SubjectContactType.PHONE: {
      const digits = value.replace(/\D/g, "");
      return PHONE_RE.test(value) && digits.length >= 6 && digits.length <= 15
        ? value.replace(/\s+/g, " ")
        : null;
    }
    case SubjectContactType.DATA_BOX:
      return value.toLowerCase();
    case SubjectContactType.WEB: {
      const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
      return isSafeHttpUrl(url) && url.length <= MAX_CONTACT_VALUE_LENGTH
        ? url
        : null;
    }
    case SubjectContactType.OTHER:
      return value;
    default:
      return null;
  }
}

/**
 * Exactly one primary per contact type: the first row marked primary wins,
 * and a type with no marked row gets its first row as primary.
 */
export function electPrimary<T extends { type: string; isPrimary: boolean }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  const marked = new Set(rows.filter((row) => row.isPrimary).map((row) => row.type));
  return rows.map((row) => {
    if (seen.has(row.type)) {
      return { ...row, isPrimary: false };
    }
    if (row.isPrimary || !marked.has(row.type)) {
      seen.add(row.type);
      return { ...row, isPrimary: true };
    }
    return { ...row, isPrimary: false };
  });
}

export type ContactParseResult =
  | { ok: true; contacts: ContactRow[] }
  | { ok: false };

/**
 * Turns the raw form rows (`contact.<key>.{id,type,value,label,primary}`) into
 * validated rows. Rows with an empty value are ignored (the new-subject form
 * starts with empty e-mail and phone rows); any other invalid row fails the
 * whole submit so nothing is silently dropped.
 */
export function parseContactRows(
  rows: Array<{ values: Record<"id" | "type" | "value" | "label" | "primary", string> }>,
): ContactParseResult {
  const contacts: ContactRow[] = [];
  const types = Object.values(SubjectContactType) as string[];

  for (const { values } of rows) {
    if (!values.value) {
      continue;
    }
    if (!types.includes(values.type)) {
      return { ok: false };
    }
    const type = values.type as SubjectContactType;
    const value = validateContactValue(type, values.value);
    if (value === null) {
      return { ok: false };
    }
    contacts.push({
      id: values.id || null,
      type,
      value,
      valueNormalized: normalizeContactValue(type, value),
      label: values.label ? values.label.slice(0, MAX_CONTACT_LABEL_LENGTH) : null,
      isPrimary: values.primary === "on" || values.primary === "true",
      position: contacts.length,
    });
    if (contacts.length > MAX_SUBJECT_CONTACTS) {
      return { ok: false };
    }
  }

  return { ok: true, contacts: electPrimary(contacts) };
}

/** Value of the primary e-mail (mirrored into `Subject.email`), or null. */
export function primaryEmail(contacts: ContactLike[]): string | null {
  const emails = contacts.filter((c) => c.type === SubjectContactType.EMAIL);
  return (emails.find((c) => c.isPrimary) ?? emails[0])?.value ?? null;
}

/** Safe link target for a contact, or null when it must render as text. */
export function contactHref(
  type: SubjectContactType | string,
  value: string,
): string | null {
  switch (type) {
    case SubjectContactType.EMAIL:
      return isValidEmail(value) ? `mailto:${value.trim()}` : null;
    case SubjectContactType.PHONE: {
      const digits = value.replace(/\D/g, "");
      if (digits.length < 6) return null;
      return `tel:${value.trim().startsWith("+") ? "+" : ""}${digits}`;
    }
    case SubjectContactType.WEB:
      return isSafeHttpUrl(value) ? value : null;
    default:
      return null;
  }
}

/**
 * Tolerates drift from code that only knows `Subject.email` (the deploy
 * window, the VPS before update, scripts): when the legacy column holds an
 * address that is not among the contact rows, it is shown/pre-filled as the
 * primary e-mail. Rows are never removed.
 */
export function mergeLegacyEmail<T extends ContactLike>(
  contacts: T[],
  legacyEmail: string | null | undefined,
): Array<T | ContactLike> {
  const email = legacyEmail?.trim();
  if (!email) {
    return contacts;
  }
  const normalized = email.toLowerCase();
  const exists = contacts.some(
    (c) =>
      c.type === SubjectContactType.EMAIL &&
      c.value.trim().toLowerCase() === normalized,
  );
  if (exists) {
    return contacts;
  }
  const demoted = contacts.map((c) =>
    c.type === SubjectContactType.EMAIL && c.isPrimary ? { ...c, isPrimary: false } : c,
  );
  return [
    { id: null, type: SubjectContactType.EMAIL, value: email, label: null, isPrimary: true },
    ...demoted,
  ];
}

/** All e-mail values of a subject (contacts + legacy column), de-duplicated. */
export function subjectEmails(
  contacts: ContactLike[],
  legacyEmail?: string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of mergeLegacyEmail(contacts, legacyEmail)) {
    if (c.type !== SubjectContactType.EMAIL) continue;
    const key = c.value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c.value.trim());
  }
  return out;
}

/**
 * Default invoice recipient: an e-mail labelled for invoicing ("fakturace",
 * "faktury"…), else the primary e-mail, else the legacy column, else "".
 */
export function pickInvoiceRecipient(
  contacts: ContactLike[],
  legacyEmail?: string | null,
): string {
  const emails = contacts.filter((c) => c.type === SubjectContactType.EMAIL);
  const billing = emails.find((c) => /faktur/i.test(c.label ?? ""));
  if (billing) {
    return billing.value.trim();
  }
  return (
    primaryEmail(mergeLegacyEmail(emails, legacyEmail))?.trim() ??
    legacyEmail?.trim() ??
    ""
  );
}
