import assert from "node:assert/strict";
import { test } from "node:test";

import { InvoiceStatus, VatMode } from "@/generated/prisma/enums";

import {
  formatInvoiceNumber,
  isDraft,
  isPastDue,
  resolvePaidStatus,
  vatModeForProfile,
} from "./invoices";

// --- formatInvoiceNumber -----------------------------------------------------

test("formatInvoiceNumber: no prefix → ROK_MĚSÍC_pořadové (seq na 4 místa)", () => {
  assert.equal(formatInvoiceNumber("", 2026, 6, 1), "2026_06_0001");
  assert.equal(formatInvoiceNumber("", 2026, 12, 42), "2026_12_0042");
});

test("formatInvoiceNumber: prefix se předřadí (AK_ROK_MĚSÍC_pořadové)", () => {
  assert.equal(formatInvoiceNumber("AK", 2026, 6, 7), "AK_2026_06_0007");
  assert.equal(formatInvoiceNumber("  AK  ", 2026, 1, 7), "AK_2026_01_0007");
});

test("formatInvoiceNumber: seq > 9999 se neořezává", () => {
  // padStart jen doplňuje, nikdy nekrátí — velké řady musí přežít celé.
  assert.equal(formatInvoiceNumber("", 2026, 6, 12345), "2026_06_12345");
});

test("formatInvoiceNumber: měsíc se doplní na 2 místa", () => {
  assert.equal(formatInvoiceNumber("AK", 2026, 9, 9999), "AK_2026_09_9999");
  assert.equal(formatInvoiceNumber("AK", 2026, 10, 10000), "AK_2026_10_10000");
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

// --- isPastDue ---------------------------------------------------------------

const NOW = new Date("2026-06-26T12:00:00.000Z");
const YESTERDAY = new Date("2026-06-25T12:00:00.000Z");
const TOMORROW = new Date("2026-06-27T12:00:00.000Z");

test("isPastDue: issued invoice past its due date is overdue", () => {
  assert.equal(
    isPastDue({ dueDate: YESTERDAY, status: InvoiceStatus.ISSUED }, NOW),
    true,
  );
});

test("isPastDue: SENT and PARTIALLY_PAID can also be overdue", () => {
  assert.equal(
    isPastDue({ dueDate: YESTERDAY, status: InvoiceStatus.SENT }, NOW),
    true,
  );
  assert.equal(
    isPastDue({ dueDate: YESTERDAY, status: InvoiceStatus.PARTIALLY_PAID }, NOW),
    true,
  );
});

test("isPastDue: future due date is not overdue", () => {
  assert.equal(
    isPastDue({ dueDate: TOMORROW, status: InvoiceStatus.ISSUED }, NOW),
    false,
  );
});

test("isPastDue: due exactly now is not yet past due (strict boundary)", () => {
  assert.equal(
    isPastDue({ dueDate: NOW, status: InvoiceStatus.ISSUED }, NOW),
    false,
  );
});

test("isPastDue: PAID and CANCELLED are never overdue", () => {
  assert.equal(
    isPastDue({ dueDate: YESTERDAY, status: InvoiceStatus.PAID }, NOW),
    false,
  );
  assert.equal(
    isPastDue({ dueDate: YESTERDAY, status: InvoiceStatus.CANCELLED }, NOW),
    false,
  );
});

test("isPastDue: a draft with no due date is never overdue", () => {
  assert.equal(
    isPastDue({ dueDate: null, status: InvoiceStatus.DRAFT }, NOW),
    false,
  );
});
