import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAttendanceCsv } from "./import";

test("parseAttendanceCsv: parses rows, skips header, defaults break to 0", () => {
  const csv = [
    "osobni;datum;odpracovano;prestavka",
    "1001;2026-06-22;8;0.5",
    "1002;2026-06-22;7,5",
  ].join("\n");
  const rows = parseAttendanceCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].personalNumber, "1001");
  assert.equal(rows[0].workDate.toISOString(), "2026-06-22T00:00:00.000Z");
  assert.equal(rows[0].workedHours, 8);
  assert.equal(rows[0].breakHours, 0.5);
  // comma decimal + missing break → 0
  assert.equal(rows[1].workedHours, 7.5);
  assert.equal(rows[1].breakHours, 0);
});

test("parseAttendanceCsv: empty input → []", () => {
  assert.deepEqual(parseAttendanceCsv(""), []);
  assert.deepEqual(parseAttendanceCsv("\n  \n"), []);
});

test("parseAttendanceCsv: header-only file → [] (no data rows, no throw)", () => {
  // A label header with no following data is a valid empty import, not an error.
  assert.deepEqual(parseAttendanceCsv("osobni;datum;odpracovano;prestavka"), []);
});

test("parseAttendanceCsv: blank trailing lines around data are ignored", () => {
  const csv = "osobni;datum;odpracovano\n\n1001;2026-06-22;8\n   \n";
  const rows = parseAttendanceCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].personalNumber, "1001");
});

test("parseAttendanceCsv: empty personal-number column throws (missing osobní číslo)", () => {
  // A leading empty field (";2026-06-22;8") must be rejected, not silently kept.
  assert.throws(() => parseAttendanceCsv(";2026-06-22;8"), /chybí osobní číslo/);
});

test("parseAttendanceCsv: malformed date throws with line number, imports nothing", () => {
  assert.throws(
    () => parseAttendanceCsv("1001;22.6.2026;8"),
    /Řádek 1: datum/,
  );
});

test("parseAttendanceCsv: too few columns throws", () => {
  assert.throws(() => parseAttendanceCsv("1001;2026-06-22"), /alespoň 3 sloupce/);
});

test("parseAttendanceCsv: non-numeric hours throws", () => {
  assert.throws(
    () => parseAttendanceCsv("1001;2026-06-22;osm"),
    /neplatná hodnota/,
  );
});

test("parseAttendanceCsv: hours out of range throws", () => {
  assert.throws(() => parseAttendanceCsv("1001;2026-06-22;30"), /mimo rozsah/);
});

test("parseAttendanceCsv: parses terminal punches and computes net hours", () => {
  const rows = parseAttendanceCsv(
    "osobniCislo;datum;prichod;odchod;prestavka\n1001;2026-07-21;08:01;16:31;0,5",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].checkIn?.toISOString(), "2026-07-21T08:01:00.000Z");
  assert.equal(rows[0].checkOut?.toISOString(), "2026-07-21T16:31:00.000Z");
  assert.equal(rows[0].workedHours, 8);
  assert.equal(rows[0].breakHours, 0.5);
});

test("parseAttendanceCsv: supports English headers in arbitrary order", () => {
  const rows = parseAttendanceCsv(
    "date;checkOut;employeeNumber;breakHours;checkIn\n2026-07-21;17:00;A-42;1;08:00",
  );
  assert.equal(rows[0].personalNumber, "A-42");
  assert.equal(rows[0].workedHours, 8);
});

test("parseAttendanceCsv: supports a night shift ending the next day", () => {
  const rows = parseAttendanceCsv("1001;2026-07-21;22:00;06:30;0,5");
  assert.equal(rows[0].checkOut?.toISOString(), "2026-07-22T06:30:00.000Z");
  assert.equal(rows[0].workedHours, 8);
});

test("parseAttendanceCsv: quoted values and a decimal comma are accepted", () => {
  const rows = parseAttendanceCsv(
    '"osobní číslo";"datum";"odpracováno";"přestávka"\n"1001";"2026-07-21";"7,5";"0,5"',
  );
  assert.equal(rows[0].workedHours, 7.5);
  assert.equal(rows[0].breakHours, 0.5);
});

test("parseAttendanceCsv: duplicate employee-day is rejected", () => {
  assert.throws(
    () =>
      parseAttendanceCsv(
        "1001;2026-07-21;8\n1001;2026-07-21;7,5",
      ),
    /vícekrát/,
  );
});

test("parseAttendanceCsv: rejects impossible calendar dates and punch ranges", () => {
  assert.throws(() => parseAttendanceCsv("1001;2026-02-31;8"), /neplatné datum/);
  assert.throws(
    () => parseAttendanceCsv("1001;2026-07-21;08:00;08:00;0"),
    /nesmí být stejný/,
  );
  assert.throws(
    () => parseAttendanceCsv("1001;2026-07-21;08:00;09:00;1"),
    /kratší než směna/,
  );
});
