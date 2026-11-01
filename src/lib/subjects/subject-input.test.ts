import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSubjectForm, subjectWriteData } from "./subject-input";

const NOW = new Date("2026-10-20T12:00:00.000Z");

function form(entries: Array<[string, string]>) {
  const formData = new FormData();
  for (const [key, value] of entries) formData.append(key, value);
  return formData;
}

test("PERSON: composed name, RČ normalized, birth date from RČ, no IČO/legal form", () => {
  const result = parseSubjectForm(
    form([
      ["type", "PERSON"],
      ["titleBefore", "JUDr."],
      ["firstName", "Jan"],
      ["lastName", "Novák"],
      ["birthNumber", "8001010006"],
      ["nationality", "Česká republika"],
      ["legalForm", "s.r.o."],
      ["tradeName", "ignored"],
      ["address", "Dlouhá 1, Praha"],
    ]),
    NOW,
  );
  assert.ok(result.ok);
  assert.equal(result.subject.name, "JUDr. Jan Novák");
  assert.equal(result.subject.birthNumber, "800101/0006");
  assert.equal(result.subject.birthDate?.toISOString(), "1980-01-01T00:00:00.000Z");
  assert.equal(result.subject.ico, null);
  assert.equal(result.subject.legalForm, null);
  assert.equal(result.subject.tradeName, null);
  assert.equal(result.subject.nationality, "Česká republika");
});

test("PERSON: an explicit birth date wins over the RČ; bad checksum is still saved", () => {
  const result = parseSubjectForm(
    form([
      ["type", "PERSON"],
      ["firstName", "Jan"],
      ["lastName", "Novák"],
      ["birthDate", "1980-01-02"],
      ["birthNumber", "800101/0007"],
    ]),
    NOW,
  );
  assert.ok(result.ok);
  assert.equal(result.subject.birthNumber, "800101/0007");
  assert.equal(result.subject.birthDate?.toISOString(), "1980-01-02T00:00:00.000Z");
});

test("PERSON: no birth date is derived from an RČ with a bad checksum", () => {
  const result = parseSubjectForm(
    form([
      ["type", "PERSON"],
      ["firstName", "Jan"],
      ["lastName", "Novák"],
      ["birthNumber", "800101/0007"],
    ]),
    NOW,
  );
  assert.ok(result.ok);
  assert.equal(result.subject.birthNumber, "800101/0007");
  assert.equal(result.subject.birthDate, null);
});

test("PERSON: errors for a malformed RČ and a missing name part", () => {
  assert.deepEqual(
    parseSubjectForm(form([["type", "PERSON"], ["firstName", "A"], ["lastName", "B"], ["birthNumber", "12345"]]), NOW),
    { ok: false, error: "birthNumber" },
  );
  assert.deepEqual(
    parseSubjectForm(form([["type", "PERSON"], ["firstName", "A"]]), NOW),
    { ok: false, error: "personName" },
  );
});

test("PERSON: legacy IČO is kept when the form still shows it", () => {
  const result = parseSubjectForm(
    form([["type", "PERSON"], ["firstName", "A"], ["lastName", "B"], ["ico", "12345678"]]),
    NOW,
  );
  assert.ok(result.ok);
  assert.equal(result.subject.ico, "12345678");
});

test("ENTREPRENEUR: trade name is the display name, no RČ", () => {
  const result = parseSubjectForm(
    form([
      ["type", "ENTREPRENEUR"],
      ["firstName", "Petr"],
      ["lastName", "Dvořák"],
      ["tradeName", "Petr Dvořák – Truhlářství"],
      ["ico", "12345678"],
      ["birthNumber", "800101/0006"],
      ["nationality", "Česká republika"],
    ]),
    NOW,
  );
  assert.ok(result.ok);
  assert.equal(result.subject.name, "Petr Dvořák – Truhlářství");
  assert.equal(result.subject.ico, "12345678");
  assert.equal(result.subject.birthNumber, null);
  assert.equal(result.subject.nationality, null);
});

test("COMPANY: name required, personal fields dropped", () => {
  assert.deepEqual(parseSubjectForm(form([["type", "COMPANY"]]), NOW), {
    ok: false,
    error: "name",
  });
  const result = parseSubjectForm(
    form([
      ["type", "COMPANY"],
      ["name", "ABC s.r.o."],
      ["firstName", "Jan"],
      ["birthNumber", "800101/0006"],
    ]),
    NOW,
  );
  assert.ok(result.ok);
  assert.equal(result.subject.name, "ABC s.r.o.");
  assert.equal(result.subject.firstName, null);
  assert.equal(result.subject.birthNumber, null);
});

test("contacts and statutory bodies sync the legacy columns", () => {
  const result = parseSubjectForm(
    form([
      ["type", "COMPANY"],
      ["name", "ABC s.r.o."],
      ["contact.a.type", "EMAIL"],
      ["contact.a.value", "info@abc.cz"],
      ["contact.b.type", "EMAIL"],
      ["contact.b.value", "fakturace@abc.cz"],
      ["contact.b.label", "fakturace"],
      ["contact.c.type", "PHONE"],
      ["contact.c.value", ""],
      ["statutory.x.name", "Jan Novák"],
      ["statutory.x.function", "jednatel"],
      ["statutory.y.name", "Bývalý Jednatel"],
      ["statutory.y.validTo", "2020-01-01"],
    ]),
    NOW,
  );
  assert.ok(result.ok);
  assert.equal(result.contacts.length, 2);
  assert.equal(result.subject.email, "info@abc.cz");
  assert.equal(result.subject.statutoryBody, "Jan Novák (jednatel)");
  assert.equal(result.statutory.length, 2);
});

test("invalid child rows map to their error codes", () => {
  assert.deepEqual(
    parseSubjectForm(
      form([["name", "A"], ["contact.a.type", "EMAIL"], ["contact.a.value", "x"]]),
      NOW,
    ),
    { ok: false, error: "contact" },
  );
  assert.deepEqual(
    parseSubjectForm(form([["name", "A"], ["statutory.a.function", "jednatel"]]), NOW),
    { ok: false, error: "statutory" },
  );
});

test("contract URL must be http(s)", () => {
  const result = parseSubjectForm(
    form([["name", "A"], ["legalServicesContractUrl", "javascript:alert(1)"]]),
    NOW,
  );
  assert.ok(result.ok);
  assert.equal(result.subject.legalServicesContractUrl, null);
});

test("subjectWriteData: rates only for users who may see them", () => {
  const result = parseSubjectForm(
    form([
      ["type", "COMPANY"],
      ["name", "Sazby s.r.o."],
      ["hourlyRate", "2500"],
      ["flatFee", "10000"],
      ["feeNote", "Poznámka"],
    ]),
    NOW,
  );
  assert.ok(result.ok);

  const allowed = subjectWriteData(result.subject, true);
  assert.equal(allowed.hourlyRate, 2500);
  assert.equal(allowed.flatFee, 10000);

  const denied = subjectWriteData(result.subject, false);
  assert.equal("hourlyRate" in denied, false);
  assert.equal("flatFee" in denied, false);
  assert.equal("feeNote" in denied, false);
  assert.equal(denied.name, "Sazby s.r.o.");
  assert.equal(allowed.feeNote, "Poznámka");
});
