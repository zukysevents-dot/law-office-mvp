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
