// Pure builder for the client-facing invoice e-mail (subject/text/html). No DB
// or Prisma client import — structurally typed and unit-testable. The action in
// `actions/invoices.ts` resolves the record + SMTP transporter and feeds the
// frozen snapshots here; ISDOC is attached separately. Mirrors the
// dependency-free formatting style of `export/invoice-export-mapper.ts`.

import type { Prisma } from "@/generated/prisma/client";
import { VatMode } from "@/generated/prisma/enums";
import { formatDate, formatMoney } from "@/lib/format";

// Mirrors formatMoney's accepted input — so amounts flow through untouched.
type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export type InvoiceEmailSupplier = {
  legalName?: string | null;
  bankAccount?: string | null;
  iban?: string | null;
};

export type InvoiceEmailInput = {
  number: string | null;
  issueDate: Date | string | null;
  dueDate: Date | string | null;
  variableSymbol: string | null;
  subtotalCzk: DecimalLike;
  vatCzk: DecimalLike;
  totalCzk: DecimalLike;
  vatMode: VatMode;
  supplier: InvoiceEmailSupplier | null;
};

export type InvoiceEmailOptions = {
  // Name shown in the sign-off (the office / issuer). Falls back to supplier
  // legalName, then a generic label.
  senderName?: string | null;
  // Optional free-text note from the lawyer, inserted above the invoice summary.
  customMessage?: string | null;
};

export type InvoiceEmailContent = {
  subject: string;
  text: string;
  html: string;
};

// RFC-5322-lite: good enough to reject typos and empty input before we hand the
// address to nodemailer. Deliberately permissive on the local/domain parts.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_RE.test(trimmed);
}

// Re-send guard: a fresh EMAIL_SENT audit younger than this blocks another send
// (defends against double-click / action retry sending the invoice twice).
export const EMAIL_RESEND_DEDUPE_MS = 60_000;

/**
 * True when the previous send is recent enough that another send should be
 * refused. `lastSentAtMs` is null/undefined when the invoice was never e-mailed.
 * Pure (caller passes the clock) so it is unit-testable.
 */
export function isWithinResendDedupeWindow(
  lastSentAtMs: number | null | undefined,
  nowMs: number,
  windowMs: number = EMAIL_RESEND_DEDUPE_MS,
): boolean {
  if (lastSentAtMs == null) {
    return false;
  }
  const elapsed = nowMs - lastSentAtMs;
  // Future timestamps (clock skew) are treated as "just sent" → block.
  return elapsed >= 0 ? elapsed < windowMs : true;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function invoiceLabel(number: string | null): string {
  return number?.trim() || "faktura";
}

/**
 * Build the Czech client e-mail for an issued invoice. Pure — same input always
 * yields the same subject/text/html, so it is fully unit-testable.
 */
export function buildInvoiceEmail(
  input: InvoiceEmailInput,
  options: InvoiceEmailOptions = {},
): InvoiceEmailContent {
  const label = invoiceLabel(input.number);
  const sender =
    options.senderName?.trim() ||
    input.supplier?.legalName?.trim() ||
    "advokátní kancelář";
  const note = options.customMessage?.trim() || null;

  const subject = input.number
    ? `Faktura ${input.number}`
    : "Faktura k úhradě";

  // Ordered key/value lines shared by the plain-text and HTML renderings.
  const rows: Array<[string, string]> = [];
  if (input.number) {
    rows.push(["Číslo faktury", input.number]);
  }
  rows.push(["Vystaveno", formatDate(input.issueDate)]);
  rows.push(["Splatnost", formatDate(input.dueDate)]);
  if (input.variableSymbol) {
    rows.push(["Variabilní symbol", input.variableSymbol]);
  }
  if (input.supplier?.bankAccount?.trim()) {
    rows.push(["Číslo účtu", input.supplier.bankAccount.trim()]);
  }
  if (input.supplier?.iban?.trim()) {
    rows.push(["IBAN", input.supplier.iban.trim()]);
  }
  rows.push(["Základ", formatMoney(input.subtotalCzk)]);
  // Non-payers issue without VAT — don't show a misleading 0 Kč DPH line.
  if (input.vatMode !== VatMode.NON_PAYER) {
    rows.push(["DPH", formatMoney(input.vatCzk)]);
  }
  rows.push(["Celkem k úhradě", formatMoney(input.totalCzk)]);

  const greeting = `Dobrý den,`;
  const intro = `v příloze Vám zasíláme ${label} ve formátu ISDOC. Níže je shrnutí.`;

  const textLines: string[] = [greeting, ""];
  if (note) {
    textLines.push(note, "");
  }
  textLines.push(intro, "");
  for (const [key, value] of rows) {
    textLines.push(`${key}: ${value}`);
  }
  textLines.push("", "S pozdravem", sender);
  const text = textLines.join("\n");

  const noteHtml = note
    ? `<p>${escapeHtml(note).replaceAll("\n", "<br />")}</p>`
    : "";
  const rowsHtml = rows
    .map(
      ([key, value]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#57534e;">${escapeHtml(
          key,
        )}</td><td style="padding:2px 0;font-weight:600;color:#072924;">${escapeHtml(
          value,
        )}</td></tr>`,
    )
    .join("");
  const html = [
    `<p>${greeting}</p>`,
    noteHtml,
    `<p>${escapeHtml(intro)}</p>`,
    `<table style="border-collapse:collapse;font-size:14px;">${rowsHtml}</table>`,
    `<p>S pozdravem<br />${escapeHtml(sender)}</p>`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, text, html };
}
