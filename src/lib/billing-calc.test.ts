import assert from "node:assert/strict";
import { test } from "node:test";

import { VatMode } from "@/generated/prisma/enums";

import {
  computeInvoiceTotals,
  computeLine,
  round2,
  type LineInput,
} from "./billing-calc";

const line = (
  quantity: number,
  unitPriceCzk: number,
  vatRate: number,
): LineInput => ({ quantity, unitPriceCzk, vatRate });

// --- round2 ------------------------------------------------------------------

test("round2: half-up at 2 decimals, no FP artifacts", () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(2.345), 2.35);
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(100), 100);
});

// --- computeLine -------------------------------------------------------------

test("computeLine: 21% standard rate", () => {
  const r = computeLine(line(10, 1000, 21), VatMode.PAYER);
  assert.deepEqual(r, { base: 10000, vat: 2100, total: 12100 });
});

test("computeLine: 12% reduced rate", () => {
  const r = computeLine(line(1, 1000, 12), VatMode.PAYER);
  assert.deepEqual(r, { base: 1000, vat: 120, total: 1120 });
});

test("computeLine: 0% rate", () => {
  const r = computeLine(line(2, 500, 0), VatMode.PAYER);
  assert.deepEqual(r, { base: 1000, vat: 0, total: 1000 });
});

test("computeLine: NON_PAYER forces 0% even when vatRate is 21", () => {
  const r = computeLine(line(10, 1000, 21), VatMode.NON_PAYER);
  assert.deepEqual(r, { base: 10000, vat: 0, total: 10000 });
});

test("computeLine: rounds to haléř", () => {
  // 333.33 * 21% = 69.9993 → 70.00
  const r = computeLine(line(1, 333.33, 21), VatMode.PAYER);
  assert.equal(r.base, 333.33);
  assert.equal(r.vat, 70);
  assert.equal(r.total, 403.33);
});

test("computeLine: zero quantity yields all-zero line", () => {
  const r = computeLine(line(0, 1000, 21), VatMode.PAYER);
  assert.deepEqual(r, { base: 0, vat: 0, total: 0 });
});

test("computeLine: negative quantity (credit/correction) keeps invariant", () => {
  // Negative lines arise on opravné/dobropisy — base+vat must still === total.
  const r = computeLine(line(-2, 1000, 21), VatMode.PAYER);
  assert.deepEqual(r, { base: -2000, vat: -420, total: -2420 });
  assert.equal(round2(r.base + r.vat), r.total);
});

// --- computeInvoiceTotals ----------------------------------------------------

test("computeInvoiceTotals: empty invoice is all zero", () => {
  assert.deepEqual(computeInvoiceTotals([], VatMode.PAYER), {
    subtotal: 0,
    vat: 0,
    total: 0,
  });
});

test("computeInvoiceTotals: mixed VAT rates on one invoice", () => {
  const totals = computeInvoiceTotals(
    [line(10, 1000, 21), line(1, 1000, 12), line(1, 500, 0)],
    VatMode.PAYER,
  );
  // bases: 10000 + 1000 + 500 = 11500; vat: 2100 + 120 + 0 = 2220
  assert.deepEqual(totals, { subtotal: 11500, vat: 2220, total: 13720 });
  assert.equal(totals.subtotal + totals.vat, totals.total);
});

test("computeInvoiceTotals: NON_PAYER zeroes all VAT", () => {
  const totals = computeInvoiceTotals(
    [line(10, 1000, 21), line(5, 200, 12)],
    VatMode.NON_PAYER,
  );
  assert.deepEqual(totals, { subtotal: 11000, vat: 0, total: 11000 });
});

test("computeInvoiceTotals: per-line rounding keeps subtotal+vat===total", () => {
  // Three lines of 333.33 @ 21%: per-line vat 70.00 each.
  const totals = computeInvoiceTotals(
    [line(1, 333.33, 21), line(1, 333.33, 21), line(1, 333.33, 21)],
    VatMode.PAYER,
  );
  assert.equal(totals.subtotal, 999.99);
  assert.equal(totals.vat, 210);
  assert.equal(totals.total, 1209.99);
  assert.equal(round2(totals.subtotal + totals.vat), totals.total);
});
