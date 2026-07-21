import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeInvoiceTotals,
  formatInvoiceNumber,
  invoiceVariableSymbol,
} from "./invoice";

test("formatInvoiceNumber zero-pads the sequence to 4 digits", () => {
  assert.equal(formatInvoiceNumber(2026, 1), "2026-0001");
  assert.equal(formatInvoiceNumber(2026, 42), "2026-0042");
  assert.equal(formatInvoiceNumber(2026, 12345), "2026-12345");
});

test("invoiceVariableSymbol is digits only", () => {
  assert.equal(invoiceVariableSymbol(2026, 1), "20260001");
});

test("computeInvoiceTotals adds VAT for a payer", () => {
  const t = computeInvoiceTotals(1000, true, 21);
  assert.equal(t.subtotal, 1000);
  assert.equal(t.vat, 210);
  assert.equal(t.total, 1210);
});

test("computeInvoiceTotals charges no VAT for a non-payer", () => {
  const t = computeInvoiceTotals(1000, false, 21);
  assert.equal(t.vat, 0);
  assert.equal(t.total, 1000);
});

test("computeInvoiceTotals rounds VAT to halér", () => {
  const t = computeInvoiceTotals(999.99, true, 21);
  assert.equal(t.subtotal, 999.99);
  assert.equal(t.vat, 210.0); // 209.9979 → 210.00
  assert.equal(t.total, 1209.99);
});
