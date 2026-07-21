// Pure invoice helpers (number formatting + DPH math). Kept dependency-free so
// they're unit-testable without a DB — this is a money path, so it has a check
// (see invoice.test.ts).

// Human-readable invoice number, unique per org+year, e.g. "2026-0001".
export function formatInvoiceNumber(year: number, seq: number) {
  return `${year}-${String(seq).padStart(4, "0")}`;
}

// Variable symbol for the bank transfer — digits only (year + padded seq).
export function invoiceVariableSymbol(year: number, seq: number) {
  return `${year}${String(seq).padStart(4, "0")}`;
}

export type InvoiceTotals = {
  subtotal: number;
  vat: number;
  total: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// DPH is only charged when the office is a registered VAT payer; otherwise the
// invoice carries no VAT and a "not a VAT payer" note.
export function computeInvoiceTotals(
  subtotal: number,
  vatPayer: boolean,
  vatRate: number,
): InvoiceTotals {
  const base = round2(subtotal);
  const vat = vatPayer ? round2((base * vatRate) / 100) : 0;
  return { subtotal: base, vat, total: round2(base + vat) };
}
