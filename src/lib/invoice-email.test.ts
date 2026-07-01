import assert from "node:assert/strict";
import { test } from "node:test";

import { VatMode } from "@/generated/prisma/enums";

import {
  buildInvoiceEmail,
  EMAIL_RESEND_DEDUPE_MS,
  isValidEmail,
  isWithinResendDedupeWindow,
} from "./invoice-email";

// --- isValidEmail ------------------------------------------------------------

test("isValidEmail: prázdné/null/undefined → false", () => {
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(undefined), false);
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("   "), false);
});

test("isValidEmail: běžná adresa projde", () => {
  assert.equal(isValidEmail("klient@firma.cz"), true);
  assert.equal(isValidEmail("  klient@firma.cz  "), true);
});

test("isValidEmail: chybějící @ nebo doména → false", () => {
  assert.equal(isValidEmail("klient.firma.cz"), false);
  assert.equal(isValidEmail("klient@firma"), false);
  assert.equal(isValidEmail("klient@"), false);
  assert.equal(isValidEmail("@firma.cz"), false);
});

test("isValidEmail: nesmí obsahovat mezery", () => {
  assert.equal(isValidEmail("kli ent@firma.cz"), false);
});

test("isValidEmail: přehnaně dlouhá adresa (>254) → false", () => {
  const long = `${"a".repeat(250)}@firma.cz`;
  assert.equal(isValidEmail(long), false);
});

// --- buildInvoiceEmail -------------------------------------------------------

const baseInput = {
  number: "AK_2026_07_0001",
  issueDate: new Date("2026-07-01T00:00:00Z"),
  dueDate: new Date("2026-07-15T00:00:00Z"),
  variableSymbol: "2026070001",
  subtotalCzk: 10000,
  vatCzk: 2100,
  totalCzk: 12100,
  vatMode: VatMode.PAYER,
  supplier: {
    legalName: "Advokátní kancelář XY",
    bankAccount: "123456789/0100",
    iban: "CZ6508000000192000145399",
  },
};

test("buildInvoiceEmail: předmět obsahuje číslo faktury", () => {
  const { subject } = buildInvoiceEmail(baseInput);
  assert.equal(subject, "Faktura AK_2026_07_0001");
});

test("buildInvoiceEmail: bez čísla → obecný předmět", () => {
  const { subject } = buildInvoiceEmail({ ...baseInput, number: null });
  assert.equal(subject, "Faktura k úhradě");
});

test("buildInvoiceEmail: text obsahuje celkovou částku, VS a číslo účtu", () => {
  const { text } = buildInvoiceEmail(baseInput);
  assert.match(text, /Variabilní symbol: 2026070001/);
  assert.match(text, /Číslo účtu: 123456789\/0100/);
  assert.match(text, /Celkem k úhradě/);
});

test("buildInvoiceEmail: plátce DPH → řádek DPH je v textu", () => {
  const { text } = buildInvoiceEmail(baseInput);
  assert.match(text, /\nDPH: /);
});

test("buildInvoiceEmail: neplátce DPH → DPH řádek se vynechá", () => {
  const { text } = buildInvoiceEmail({
    ...baseInput,
    vatMode: VatMode.NON_PAYER,
    vatCzk: 0,
  });
  assert.doesNotMatch(text, /\nDPH: /);
});

test("buildInvoiceEmail: vlastní zpráva se vloží do textu i HTML", () => {
  const { text, html } = buildInvoiceEmail(baseInput, {
    customMessage: "Děkujeme za spolupráci.",
  });
  assert.match(text, /Děkujeme za spolupráci\./);
  assert.match(html, /Děkujeme za spolupráci\./);
});

test("buildInvoiceEmail: HTML escapuje nebezpečné znaky ze zprávy", () => {
  const { html } = buildInvoiceEmail(baseInput, {
    customMessage: "<script>alert(1)</script>",
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("buildInvoiceEmail: podpis = senderName, jinak legalName dodavatele", () => {
  const withName = buildInvoiceEmail(baseInput, { senderName: "Mgr. Novák" });
  assert.match(withName.text, /S pozdravem\nMgr\. Novák/);

  const fallback = buildInvoiceEmail(baseInput);
  assert.match(fallback.text, /S pozdravem\nAdvokátní kancelář XY/);
});

test("buildInvoiceEmail: chybí-li dodavatel i jméno → obecný podpis", () => {
  const { text } = buildInvoiceEmail({ ...baseInput, supplier: null });
  assert.match(text, /S pozdravem\nadvokátní kancelář/);
});

test("buildInvoiceEmail: bez IBAN/účtu se příslušné řádky vynechají", () => {
  const { text } = buildInvoiceEmail({
    ...baseInput,
    supplier: { legalName: "AK", bankAccount: null, iban: null },
  });
  assert.doesNotMatch(text, /Číslo účtu/);
  assert.doesNotMatch(text, /IBAN/);
});

// --- isWithinResendDedupeWindow ---------------------------------------------

test("isWithinResendDedupeWindow: nikdy neodesláno (null) → false", () => {
  assert.equal(isWithinResendDedupeWindow(null, 1_000_000), false);
  assert.equal(isWithinResendDedupeWindow(undefined, 1_000_000), false);
});

test("isWithinResendDedupeWindow: čerstvé odeslání (uvnitř okna) → true (blok)", () => {
  const now = 1_000_000;
  assert.equal(isWithinResendDedupeWindow(now - 5_000, now), true);
});

test("isWithinResendDedupeWindow: starší než okno → false (povolit)", () => {
  const now = 1_000_000;
  assert.equal(
    isWithinResendDedupeWindow(now - EMAIL_RESEND_DEDUPE_MS - 1, now),
    false,
  );
});

test("isWithinResendDedupeWindow: přesně na hranici okna → false (povolit)", () => {
  const now = 1_000_000;
  assert.equal(
    isWithinResendDedupeWindow(now - EMAIL_RESEND_DEDUPE_MS, now),
    false,
  );
});

test("isWithinResendDedupeWindow: budoucí timestamp (clock skew) → true (blok)", () => {
  const now = 1_000_000;
  assert.equal(isWithinResendDedupeWindow(now + 10_000, now), true);
});
