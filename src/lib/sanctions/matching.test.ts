import assert from "node:assert/strict";
import { test } from "node:test";

import {
  jaroWinkler,
  scoreNameMatch,
  selectCandidates,
  tokenScore,
  type ScorableEntry,
} from "./matching";

// --- jaroWinkler -------------------------------------------------------------

test("jaroWinkler: identical strings score 1", () => {
  assert.equal(jaroWinkler("novak", "novak"), 1);
});

test("jaroWinkler: an empty input scores 0", () => {
  assert.equal(jaroWinkler("", "novak"), 0);
  assert.equal(jaroWinkler("novak", ""), 0);
});

test("jaroWinkler: two empty strings count as identical → 1", () => {
  // a === b short-circuits to 1 before the length check.
  assert.equal(jaroWinkler("", ""), 1);
});

test("jaroWinkler: a one-character typo scores high but below 1", () => {
  const score = jaroWinkler("jan", "jen");
  assert.ok(score > 0.7, `expected > 0.7, got ${score}`);
  assert.ok(score < 1, `expected < 1, got ${score}`);
});

test("jaroWinkler: wholly different strings score low", () => {
  const score = jaroWinkler("abcdef", "wxyz");
  assert.ok(score < 0.5, `expected < 0.5, got ${score}`);
});

test("jaroWinkler: a shared prefix boosts the score above plain Jaro", () => {
  // "martha"/"marhta" is the classic Jaro-Winkler example: prefix bonus applies.
  const score = jaroWinkler("martha", "marhta");
  assert.ok(score > 0.9 && score < 1, `expected (0.9,1), got ${score}`);
});

// --- tokenScore --------------------------------------------------------------

test("tokenScore: order-independent match of the same tokens", () => {
  const a = tokenScore(["jan", "novak"], ["jan", "novak"]);
  const b = tokenScore(["jan", "novak"], ["novak", "jan"]);
  assert.equal(a, 1);
  assert.equal(b, 1);
});

test("tokenScore: reordered fuzzy tokens still score high", () => {
  const score = tokenScore(["jan", "novak"], ["novakk", "jen"]);
  assert.ok(score > 0.8, `expected > 0.8, got ${score}`);
  assert.ok(score < 1, `expected < 1, got ${score}`);
});

test("tokenScore: empty query tokens score 0", () => {
  assert.equal(tokenScore([], ["jan", "novak"]), 0);
});

test("tokenScore: empty entry tokens score 0", () => {
  assert.equal(tokenScore(["jan", "novak"], []), 0);
});

// --- scoreNameMatch ----------------------------------------------------------

test("scoreNameMatch: exact match on the primary name scores 1", () => {
  assert.equal(scoreNameMatch("jan novak", "jan novak"), 1);
});

test("scoreNameMatch: order-independent primary match scores 1", () => {
  assert.equal(scoreNameMatch("jan novak", "novak jan"), 1);
});

test("scoreNameMatch: matches an alias when the primary differs", () => {
  const score = scoreNameMatch("ivan petrov", "jan novak", [
    "petr svoboda",
    "ivan petrov",
  ]);
  assert.equal(score, 1);
});

test("scoreNameMatch: takes the maximum across primary and aliases", () => {
  // Primary is a weak match; one alias is exact → result must be the alias score.
  const score = scoreNameMatch("jan novak", "zcela jine jmeno", [
    "jan novak",
  ]);
  assert.equal(score, 1);
});

test("scoreNameMatch: empty query scores 0 regardless of candidates", () => {
  assert.equal(scoreNameMatch("", "jan novak", ["jan novak"]), 0);
  assert.equal(scoreNameMatch("   ", "jan novak"), 0);
});

// --- selectCandidates --------------------------------------------------------

type Entry = ScorableEntry & { id: string };

function entry(id: string, normalizedName: string, aliases: string[] = []): Entry {
  return { id, normalizedName, aliasesNormalized: aliases };
}

test("selectCandidates: drops entries below the threshold", () => {
  const entries: Entry[] = [
    entry("a", "jan novak"),
    entry("b", "petr svoboda"),
  ];
  const result = selectCandidates("jan novak", entries, {
    threshold: 0.82,
    limit: 20,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].entry.id, "a");
  assert.equal(result[0].score, 1);
});

test("selectCandidates: sorts matches best-first (descending score)", () => {
  const entries: Entry[] = [
    entry("near", "jan novakk"),
    entry("exact", "jan novak"),
  ];
  const result = selectCandidates("jan novak", entries, {
    threshold: 0.5,
    limit: 20,
  });
  assert.deepEqual(
    result.map((candidate) => candidate.entry.id),
    ["exact", "near"],
  );
  assert.ok(result[0].score >= result[1].score);
});

test("selectCandidates: caps the result at the configured limit", () => {
  const entries: Entry[] = [
    entry("a", "jan novak"),
    entry("b", "jan novak"),
    entry("c", "jan novak"),
  ];
  const result = selectCandidates("jan novak", entries, {
    threshold: 0.5,
    limit: 2,
  });
  assert.equal(result.length, 2);
});

test("selectCandidates: returns { entry, score } pairs", () => {
  const entries: Entry[] = [entry("a", "jan novak")];
  const result = selectCandidates("jan novak", entries, {
    threshold: 0.5,
    limit: 20,
  });
  assert.equal(result.length, 1);
  assert.deepEqual(Object.keys(result[0]).sort(), ["entry", "score"]);
  assert.equal(result[0].entry, entries[0]);
  assert.equal(typeof result[0].score, "number");
});

test("selectCandidates: an empty entry list yields no candidates", () => {
  const result = selectCandidates("jan novak", [], {
    threshold: 0.5,
    limit: 20,
  });
  assert.deepEqual(result, []);
});
