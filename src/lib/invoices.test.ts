import assert from "node:assert/strict";
import { test } from "node:test";

import { InvoiceStatus, VatMode } from "@/generated/prisma/enums";

import {
  formatInvoiceNumber,
  isDraft,
  resolvePaidStatus,
  vatModeForProfile,
} from "./invoices";

// --- formatInvoiceNumber -----------------------------------------------------

test("formatInvoiceNumber: no prefix, pads seq to 4 places", () => {
  assert.equal(formatInvoiceNumber("", 2026, 1), "20260001");
  assert.equal(formatInvoiceNumber("", 2026, 42), "20260042");
});

test("formatInvoiceNumber: prefix is prepended verbatim", () => {
  assert.equal(formatInvoiceNumber("F", 2026, 7), "F20260007");
});

test("formatInvoiceNumber: seq > 9999 is not truncated", () => {
  // padStart only pads, never cuts — large sequences must survive intact.
  assert.equal(formatInvoiceNumber("", 2026, 12345), "202612345");
});

test("formatInvoiceNumber: boundary at exactly 4 digits keeps no extra padding", () => {
  assert.equal(formatInvoiceNumber("", 2026, 9999), "20269999");
  assert.equal(formatInvoiceNumber("", 2026, 10000), "202610000");
});

// --- vatModeForProfile -------------------------------------------------------

test("vatModeForProfile: VAT payer → PAYER", () => {
  assert.equal(vatModeForProfile(true), VatMode.PAYER);
});

test("vatModeForProfile: non payer → NON_PAYER", () => {
  assert.equal(vatModeForProfile(false), VatMode.NON_PAYER);
});

test("vatModeForProfile: null/undefined fail-safe to NON_PAYER", () => {
  // Fail-safe: never charge VAT we shouldn't when the profile flag is unknown.
  assert.equal(vatModeForProfile(null), VatMode.NON_PAYER);
  assert.equal(vatModeForProfile(undefined), VatMode.NON_PAYER);
});

// --- isDraft -----------------------------------------------------------------

test("isDraft: only DRAFT is editable", () => {
  assert.equal(isDraft("DRAFT"), true);
  assert.equal(isDraft("ISSUED"), false);
});

test("isDraft: later statuses and unknown values are not drafts", () => {
  assert.equal(isDraft("PAID"), false);
  assert.equal(isDraft("CANCELLED"), false);
  assert.equal(isDraft(""), false);
});

// --- resolvePaidStatus -------------------------------------------------------

test("resolvePaidStatus: partial payment stays PARTIALLY_PAID", () => {
  // 5000 paid out of 24200 owed — invoice is not yet covered.
  assert.equal(resolvePaidStatus(24200, 5000), InvoiceStatus.PARTIALLY_PAID);
});

test("resolvePaidStatus: exact full amount flips to PAID (boundary)", () => {
  // paidCzk === totalCzk must count as fully paid (>= boundary).
  assert.equal(resolvePaidStatus(24200, 24200), InvoiceStatus.PAID);
});

test("resolvePaidStatus: overpayment is still PAID", () => {
  // Overpayment (25000 > 24200) must not regress to PARTIALLY_PAID.
  assert.equal(resolvePaidStatus(24200, 25000), InvoiceStatus.PAID);
});

test("resolvePaidStatus: tiny partial payment is PARTIALLY_PAID", () => {
  // Smallest meaningful partial payment must not be rounded up to PAID.
  assert.equal(resolvePaidStatus(100, 0.01), InvoiceStatus.PARTIALLY_PAID);
});
