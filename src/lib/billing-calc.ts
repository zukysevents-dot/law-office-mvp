import { VatMode } from "@/generated/prisma/enums";

// Pure VAT/total maths for invoices. No DB, no clock — fully unit-testable
// (node --test), and shared by the draft preview (UI) and the authoritative
// recompute in issueInvoice. Money is computed in CZK as numbers here; callers
// persist the results as Prisma Decimal(12,2).

export type LineInput = {
  quantity: number;
  unitPriceCzk: number;
  vatRate: number; // percent, e.g. 21 / 12 / 0
};

export type LineResult = {
  base: number; // line total without VAT
  vat: number;
  total: number; // base + vat
};

export type InvoiceTotals = {
  subtotal: number; // sum of line bases (without VAT)
  vat: number;
  total: number; // subtotal + vat
};

// Round to 2 decimal places, half-up. The epsilon nudge avoids binary
// floating-point artifacts (e.g. 1.005 → 1.01, not 1.00).
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// One invoice line. NON_PAYER forces a 0% rate regardless of the line's vatRate
// (a non-VAT-payer issuer never charges VAT).
export function computeLine(line: LineInput, vatMode: VatMode): LineResult {
  const base = round2(line.quantity * line.unitPriceCzk);
  const rate = vatMode === VatMode.NON_PAYER ? 0 : line.vatRate;
  const vat = round2((base * rate) / 100);
  const total = round2(base + vat);
  return { base, vat, total };
}

// Totals over all lines. Rounds PER LINE then accumulates (standard accounting
// approach) so the invariant subtotal + vat === total always holds to 2dp and
// there are no haléř drifts from summing unrounded products.
export function computeInvoiceTotals(
  lines: LineInput[],
  vatMode: VatMode,
): InvoiceTotals {
  let subtotal = 0;
  let vat = 0;
  for (const line of lines) {
    const result = computeLine(line, vatMode);
    subtotal = round2(subtotal + result.base);
    vat = round2(vat + result.vat);
  }
  const total = round2(subtotal + vat);
  return { subtotal, vat, total };
}
