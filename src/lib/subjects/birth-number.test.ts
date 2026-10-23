import assert from "node:assert/strict";
import { test } from "node:test";

import {
  birthNumberSearchKey,
  maskBirthNumber,
  parseBirthNumber,
  redactBirthNumberQuery,
} from "./birth-number";

const NOW = new Date("2026-10-20T12:00:00.000Z");

test("parseBirthNumber: empty input is null (the field is optional)", () => {
  assert.equal(parseBirthNumber("", NOW), null);
  assert.equal(parseBirthNumber("   ", NOW), null);
  assert.equal(parseBirthNumber(null, NOW), null);
});

test("parseBirthNumber: valid male number, with or without slash and spaces", () => {
  for (const raw of ["800101/0006", "8001010006", " 800101 / 0006 "]) {
    const parsed = parseBirthNumber(raw, NOW);
    assert.ok(parsed?.ok);
    assert.equal(parsed.normalized, "800101/0006");
    assert.equal(parsed.checksumValid, true);
    assert.equal(parsed.dateValid, true);
    assert.equal(parsed.birthDate?.toISOString(), "1980-01-01T00:00:00.000Z");
  }
});

test("parseBirthNumber: woman (+50 month)", () => {
  const parsed = parseBirthNumber("855115/0003", NOW);
  assert.ok(parsed?.ok);
  assert.equal(parsed.checksumValid, true);
  assert.equal(parsed.birthDate?.toISOString(), "1985-01-15T00:00:00.000Z");
});

test("parseBirthNumber: bad checksum is reported, not rejected", () => {
  const parsed = parseBirthNumber("800101/0007", NOW);
  assert.ok(parsed?.ok);
  assert.equal(parsed.checksumValid, false);
  assert.equal(parsed.dateValid, true);
});

test("parseBirthNumber: impossible date (30 Feb 2004) is reported", () => {
  const parsed = parseBirthNumber("045230/0002", NOW);
  assert.ok(parsed?.ok);
  assert.equal(parsed.dateValid, false);
  assert.equal(parsed.birthDate, null);
});

test("parseBirthNumber: a future date is not a valid birth date", () => {
  const parsed = parseBirthNumber("300101/0007", NOW);
  assert.ok(parsed?.ok);
  assert.equal(parsed.dateValid, false);
});

test("parseBirthNumber: 9-digit numbers only before 1954, without checksum", () => {
  const old = parseBirthNumber("520101/123", NOW);
  assert.ok(old?.ok);
  assert.equal(old.normalized, "520101/123");
  assert.equal(old.checksumValid, true);
  assert.equal(old.birthDate?.toISOString(), "1952-01-01T00:00:00.000Z");

  const tooYoung = parseBirthNumber("600101/123", NOW);
  assert.ok(tooYoung?.ok);
  assert.equal(tooYoung.checksumValid, false);
});

test("parseBirthNumber: checksum remainder 10 with last digit 0 is valid", () => {
  // 800101004 % 11 === 10 → the check digit is 0.
  assert.equal(800101004 % 11, 10);
  const parsed = parseBirthNumber("800101/0040", NOW);
  assert.ok(parsed?.ok);
  assert.equal(parsed.checksumValid, true);
});

test("parseBirthNumber: wrong shape is rejected", () => {
  for (const raw of ["12345", "800101/00067", "abcdef/ghij", "80-01-01/0006"]) {
    assert.deepEqual(parseBirthNumber(raw, NOW), { ok: false }, raw);
  }
});

test("maskBirthNumber: keeps only the last two digits", () => {
  assert.equal(maskBirthNumber("800101/0006"), "••••••/••06");
  assert.equal(maskBirthNumber("520101/123"), "••••••/•23");
  assert.equal(maskBirthNumber("garbage"), "••••••/••••");
  assert.equal(maskBirthNumber(null), "");
});

test("birthNumberSearchKey: only full RČ-shaped queries", () => {
  assert.equal(birthNumberSearchKey("8001010006"), "800101/0006");
  assert.equal(birthNumberSearchKey("800101"), null);
  assert.equal(birthNumberSearchKey("Novák"), null);
});

test("redactBirthNumberQuery: masks only RČ-shaped queries", () => {
  assert.equal(redactBirthNumberQuery("800101/0006"), "••••••/••06");
  assert.equal(redactBirthNumberQuery("8001010006"), "••••••/••06");
  assert.equal(redactBirthNumberQuery("ABC s.r.o."), "ABC s.r.o.");
  assert.equal(redactBirthNumberQuery("12345678"), "12345678");
});
