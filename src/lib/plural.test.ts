import assert from "node:assert/strict";
import { test } from "node:test";

import { countLabel, czechPlural } from "./plural";

const MEMBER = ["člen", "členové", "členů"] as const;

test("czechPlural: 1 / 2–4 / 0 a 5+", () => {
  assert.equal(czechPlural(0, MEMBER), "členů");
  assert.equal(czechPlural(1, MEMBER), "člen");
  assert.equal(czechPlural(2, MEMBER), "členové");
  assert.equal(czechPlural(4, MEMBER), "členové");
  assert.equal(czechPlural(5, MEMBER), "členů");
  // Česky se řídí celým číslem, ne poslední číslicí: „22 členů".
  assert.equal(czechPlural(22, MEMBER), "členů");
});

test("countLabel: číslo + tvar", () => {
  assert.equal(countLabel(3, MEMBER), "3 členové");
  assert.equal(countLabel(1, ["projekt", "projekty", "projektů"]), "1 projekt");
});
