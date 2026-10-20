import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isCurrentStatutory,
  mergeLegacyStatutory,
  parseStatutoryRows,
  statutorySummary,
} from "./statutory";

const NOW = new Date("2026-10-20T12:00:00.000Z");

function row(values: Partial<Record<string, string>>) {
  return {
    values: {
      id: "",
      name: "",
      function: "",
      actingMethod: "",
      validFrom: "",
      validTo: "",
      linkedSubjectId: "",
      ...values,
    },
  };
}

test("parseStatutoryRows: ignores empty rows, keeps order", () => {
  const result = parseStatutoryRows([
    row({}),
    row({ name: "Jan Novák", function: "jednatel", validFrom: "2020-01-01", id: "s1" }),
    row({ name: "Petr Malý", linkedSubjectId: "subj-2" }),
  ]);
  assert.ok(result.ok);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0], {
    id: "s1",
    name: "Jan Novák",
    function: "jednatel",
    actingMethod: null,
    validFrom: new Date("2020-01-01T00:00:00.000Z"),
    validTo: null,
    linkedSubjectId: null,
    position: 0,
  });
  assert.equal(result.rows[1].linkedSubjectId, "subj-2");
  assert.equal(result.rows[1].position, 1);
});

test("parseStatutoryRows: name required once anything is filled", () => {
  assert.deepEqual(parseStatutoryRows([row({ function: "jednatel" })]), { ok: false });
});

test("parseStatutoryRows: 'Do' must not precede 'Od', dates must be real", () => {
  assert.deepEqual(
    parseStatutoryRows([row({ name: "A", validFrom: "2024-05-01", validTo: "2024-04-30" })]),
    { ok: false },
  );
  assert.deepEqual(parseStatutoryRows([row({ name: "A", validFrom: "2024-02-30" })]), { ok: false });
  assert.ok(parseStatutoryRows([row({ name: "A", validFrom: "2024-05-01", validTo: "2024-05-01" })]).ok);
});

test("isCurrentStatutory and statutorySummary", () => {
  const rows = [
    { name: "Jan Novák", function: "jednatel" },
    { name: "Bývalý", function: "jednatel", validTo: new Date("2020-01-01") },
    { name: "Dnes končí", validTo: new Date("2026-10-20T00:00:00.000Z") },
    { name: "Budoucí", validFrom: new Date("2027-01-01") },
  ];
  assert.equal(isCurrentStatutory(rows[0], NOW), true);
  assert.equal(isCurrentStatutory(rows[1], NOW), false);
  assert.equal(isCurrentStatutory(rows[2], NOW), true);
  assert.equal(isCurrentStatutory(rows[3], NOW), false);
  assert.equal(statutorySummary(rows, NOW), "Jan Novák (jednatel); Dnes končí");
  assert.equal(statutorySummary([], NOW), null);
});

test("mergeLegacyStatutory: legacy text only when it is not covered", () => {
  const rows = [{ name: "Jan Novák", function: "jednatel" }];
  assert.equal(mergeLegacyStatutory(rows, "Jan Novák (jednatel)"), rows);
  assert.equal(mergeLegacyStatutory(rows, "Jan Novák"), rows);
  assert.equal(mergeLegacyStatutory(rows, null), rows);
  const merged = mergeLegacyStatutory(rows, "Ing. Petr Novák, jednatel");
  assert.equal(merged.length, 2);
  assert.equal(merged[1].name, "Ing. Petr Novák, jednatel");
  assert.equal(mergeLegacyStatutory([], "Ing. Petr Novák").length, 1);
});
