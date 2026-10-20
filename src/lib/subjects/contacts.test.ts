import assert from "node:assert/strict";
import { test } from "node:test";

import { SubjectContactType } from "@/generated/prisma/enums";

import {
  contactHref,
  electPrimary,
  mergeLegacyEmail,
  normalizeContactValue,
  parseContactRows,
  pickInvoiceRecipient,
  primaryEmail,
  subjectEmails,
  validateContactValue,
} from "./contacts";

const { EMAIL, PHONE, DATA_BOX, WEB, OTHER } = SubjectContactType;

function row(type: string, value: string, extra: Partial<Record<"id" | "label" | "primary", string>> = {}) {
  return { values: { id: "", label: "", primary: "", ...extra, type, value } };
}

test("normalizeContactValue: e-mail lower-case, phone digits only", () => {
  assert.equal(normalizeContactValue(EMAIL, " Info@ABC.cz "), "info@abc.cz");
  assert.equal(normalizeContactValue(PHONE, "+420 777 123 456"), "420777123456");
  assert.equal(normalizeContactValue(DATA_BOX, "AbC123d"), "abc123d");
});

test("validateContactValue: per type", () => {
  assert.equal(validateContactValue(EMAIL, "a@b.cz"), "a@b.cz");
  assert.equal(validateContactValue(EMAIL, "not-an-email"), null);
  assert.equal(validateContactValue(PHONE, "+420  777 123 456"), "+420 777 123 456");
  assert.equal(validateContactValue(PHONE, "abc"), null);
  assert.equal(validateContactValue(PHONE, "12"), null);
  assert.equal(validateContactValue(DATA_BOX, " ABC1234 "), "abc1234");
  assert.equal(validateContactValue(WEB, "www.abc.cz"), "https://www.abc.cz");
  assert.equal(validateContactValue(WEB, "javascript:alert(1)"), null);
  assert.equal(validateContactValue(OTHER, "Skype: novak"), "Skype: novak");
  assert.equal(validateContactValue(EMAIL, `${"a".repeat(320)}@b.cz`), null);
  assert.equal(validateContactValue("FAX", "123"), null);
});

test("electPrimary: one primary per type", () => {
  const result = electPrimary([
    { type: EMAIL, isPrimary: false },
    { type: EMAIL, isPrimary: true },
    { type: EMAIL, isPrimary: true },
    { type: PHONE, isPrimary: false },
    { type: PHONE, isPrimary: false },
  ]);
  assert.deepEqual(
    result.map((r) => r.isPrimary),
    [false, true, false, true, false],
  );
});

test("parseContactRows: skips empty rows, validates, positions in order", () => {
  const result = parseContactRows([
    row(EMAIL, ""),
    row(EMAIL, "info@abc.cz"),
    row(EMAIL, "Fakturace@ABC.cz", { label: "fakturace", primary: "on", id: "c1" }),
    row(PHONE, "+420 777 123 456"),
  ]);
  assert.ok(result.ok);
  assert.deepEqual(
    result.contacts.map((c) => [c.id, c.type, c.valueNormalized, c.isPrimary, c.position, c.label]),
    [
      [null, EMAIL, "info@abc.cz", false, 0, null],
      ["c1", EMAIL, "fakturace@abc.cz", true, 1, "fakturace"],
      [null, PHONE, "420777123456", true, 2, null],
    ],
  );
});

test("parseContactRows: an invalid value or type fails the whole submit", () => {
  assert.deepEqual(parseContactRows([row(EMAIL, "nope")]), { ok: false });
  assert.deepEqual(parseContactRows([row("FAX", "123456")]), { ok: false });
});

test("parseContactRows: limit on the number of contacts", () => {
  const rows = Array.from({ length: 51 }, (_, i) => row(EMAIL, `a${i}@b.cz`));
  assert.deepEqual(parseContactRows(rows), { ok: false });
});

test("primaryEmail and subjectEmails", () => {
  const contacts = [
    { type: PHONE, value: "777", isPrimary: true },
    { type: EMAIL, value: "a@b.cz", isPrimary: false },
    { type: EMAIL, value: "c@d.cz", isPrimary: true },
  ];
  assert.equal(primaryEmail(contacts), "c@d.cz");
  assert.equal(primaryEmail([{ type: EMAIL, value: "x@y.cz", isPrimary: false }]), "x@y.cz");
  assert.equal(primaryEmail([]), null);
  assert.deepEqual(subjectEmails(contacts, "A@b.cz"), ["a@b.cz", "c@d.cz"]);
});

test("contactHref: mailto/tel/web only when safe", () => {
  assert.equal(contactHref(EMAIL, "a@b.cz"), "mailto:a@b.cz");
  assert.equal(contactHref(PHONE, "+420 777 123 456"), "tel:+420777123456");
  assert.equal(contactHref(PHONE, "777 123 456"), "tel:777123456");
  assert.equal(contactHref(WEB, "https://abc.cz"), "https://abc.cz");
  assert.equal(contactHref(WEB, "javascript:alert(1)"), null);
  assert.equal(contactHref(DATA_BOX, "abc1234"), null);
});

test("mergeLegacyEmail: drifted legacy column becomes the primary e-mail", () => {
  const contacts = [{ id: "1", type: EMAIL, value: "old@abc.cz", isPrimary: true }];
  assert.equal(mergeLegacyEmail(contacts, "OLD@abc.cz"), contacts);
  assert.equal(mergeLegacyEmail(contacts, null), contacts);
  const merged = mergeLegacyEmail(contacts, "new@abc.cz");
  assert.deepEqual(
    merged.map((c) => [c.value, c.isPrimary]),
    [
      ["new@abc.cz", true],
      ["old@abc.cz", false],
    ],
  );
});

test("pickInvoiceRecipient: billing label, then primary, then legacy", () => {
  const contacts = [
    { type: EMAIL, value: "info@abc.cz", isPrimary: true, label: null },
    { type: EMAIL, value: "fakturace@abc.cz", isPrimary: false, label: "Fakturace" },
  ];
  assert.equal(pickInvoiceRecipient(contacts, "info@abc.cz"), "fakturace@abc.cz");
  assert.equal(pickInvoiceRecipient(contacts.slice(0, 1), "info@abc.cz"), "info@abc.cz");
  assert.equal(pickInvoiceRecipient([], "legacy@abc.cz"), "legacy@abc.cz");
  assert.equal(pickInvoiceRecipient([], null), "");
});
