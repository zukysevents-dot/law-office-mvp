import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCsvLine, parseEuSanctionsCsv } from "./source-eu";

// --- parseCsvLine ------------------------------------------------------------

test("parseCsvLine: splits a plain ';'-delimited line", () => {
  assert.deepEqual(parseCsvLine("a;b;c"), ["a", "b", "c"]);
});

test("parseCsvLine: trims surrounding whitespace per field", () => {
  assert.deepEqual(parseCsvLine(" a ; b ;c "), ["a", "b", "c"]);
});

test("parseCsvLine: a quoted field may contain the ';' delimiter", () => {
  assert.deepEqual(parseCsvLine('a;"b;c";d'), ["a", "b;c", "d"]);
});

test('parseCsvLine: doubled "" inside quotes is an escaped quote', () => {
  assert.deepEqual(parseCsvLine('a;"say ""hi""";c'), ["a", 'say "hi"', "c"]);
});

test("parseCsvLine: trailing empty field is preserved", () => {
  assert.deepEqual(parseCsvLine("a;b;"), ["a", "b", ""]);
});

test("parseCsvLine: an empty line yields one empty field", () => {
  assert.deepEqual(parseCsvLine(""), [""]);
});

// --- parseEuSanctionsCsv -----------------------------------------------------

const HEADER =
  "Entity_LogicalId;Entity_SubjectType;NameAlias_WholeName;NameAlias_FirstName;NameAlias_LastName;Address_Country;Entity_Programme";

test("parseEuSanctionsCsv: fewer than 2 lines returns []", () => {
  assert.deepEqual(parseEuSanctionsCsv(""), []);
  assert.deepEqual(parseEuSanctionsCsv(HEADER), []);
});

test("parseEuSanctionsCsv: maps a single person row", () => {
  const csv = [HEADER, "1;person;Jan Novak;;;CZ;EU.123"].join("\n");
  const entries = parseEuSanctionsCsv(csv);
  assert.equal(entries.length, 1);
  const [e] = entries;
  assert.equal(e.sourceEntityId, "1");
  assert.equal(e.entityType, "PERSON");
  assert.equal(e.primaryName, "Jan Novak");
  assert.equal(e.normalizedName, "jan novak");
  assert.deepEqual(e.aliasesNormalized, []);
  assert.deepEqual(e.countries, ["CZ"]);
  assert.deepEqual(e.programs, ["EU.123"]);
});

test("parseEuSanctionsCsv: non-person subject type maps to ENTITY", () => {
  const csv = [HEADER, "2;enterprise;Evil Corp;;;RU;EU.999"].join("\n");
  const [e] = parseEuSanctionsCsv(csv);
  assert.equal(e.entityType, "ENTITY");
});

test("parseEuSanctionsCsv: composes a name from first/last when WholeName is empty", () => {
  const csv = [HEADER, "3;person;;Petr;Svoboda;SK;EU.1"].join("\n");
  const [e] = parseEuSanctionsCsv(csv);
  assert.equal(e.primaryName, "Petr Svoboda");
  assert.equal(e.normalizedName, "petr svoboda");
});

test("parseEuSanctionsCsv: groups rows sharing an entity id into one record", () => {
  const csv = [
    HEADER,
    "10;person;Jan Novak;;;CZ;EU.A",
    "10;person;Honza Novak;;;SK;EU.B",
    "10;person;Ivan Petrov;;;;",
  ].join("\n");
  const entries = parseEuSanctionsCsv(csv);
  assert.equal(entries.length, 1);
  const [e] = entries;
  // First name wins as primary; the rest become normalized aliases.
  assert.equal(e.primaryName, "Jan Novak");
  assert.equal(e.normalizedName, "jan novak");
  assert.deepEqual(e.aliasesNormalized, ["honza novak", "ivan petrov"]);
  // Countries and programs accumulate uniquely, in encounter order.
  assert.deepEqual(e.countries, ["CZ", "SK"]);
  assert.deepEqual(e.programs, ["EU.A", "EU.B"]);
});

test("parseEuSanctionsCsv: a duplicate alias name is not added twice", () => {
  const csv = [
    HEADER,
    "11;person;Jan Novak;;;CZ;EU.A",
    "11;person;Jan Novak;;;CZ;EU.A",
  ].join("\n");
  const [e] = parseEuSanctionsCsv(csv);
  assert.deepEqual(e.aliasesNormalized, []);
  assert.deepEqual(e.countries, ["CZ"]);
  assert.deepEqual(e.programs, ["EU.A"]);
});

test("parseEuSanctionsCsv: rows with no name are ignored", () => {
  const csv = [
    HEADER,
    "20;person;;;;CZ;EU.A",
    "21;person;Jan Novak;;;CZ;EU.A",
  ].join("\n");
  const entries = parseEuSanctionsCsv(csv);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceEntityId, "21");
});

test("parseEuSanctionsCsv: distinct entity ids produce separate records", () => {
  const csv = [
    HEADER,
    "30;person;Jan Novak;;;CZ;EU.A",
    "31;enterprise;Evil Corp;;;RU;EU.B",
  ].join("\n");
  const entries = parseEuSanctionsCsv(csv);
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((e) => e.sourceEntityId).sort(),
    ["30", "31"],
  );
});

test("parseEuSanctionsCsv: tolerates CRLF line endings and blank lines", () => {
  const csv = [HEADER, "", "40;person;Jan Novak;;;CZ;EU.A", ""].join("\r\n");
  const entries = parseEuSanctionsCsv(csv);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].primaryName, "Jan Novak");
});
