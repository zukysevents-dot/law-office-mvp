import assert from "node:assert/strict";
import { test } from "node:test";

import { nameTokens, normalizeName } from "./normalize";

// --- normalizeName -----------------------------------------------------------

test("normalizeName: strips Czech diacritics and lowercases", () => {
  assert.equal(normalizeName("Žluťoučký Kůň"), "zlutoucky kun");
});

test("normalizeName: lowercases plain ASCII", () => {
  assert.equal(normalizeName("JAN Novak"), "jan novak");
});

test("normalizeName: turns punctuation into a single space", () => {
  assert.equal(normalizeName("Novak, Jan"), "novak jan");
  assert.equal(normalizeName("O'Brien-Smith"), "o brien smith");
  assert.equal(normalizeName("a.s. & spol."), "a s spol");
});

test("normalizeName: collapses runs of whitespace and trims", () => {
  assert.equal(normalizeName("  Jan    Novak  "), "jan novak");
  assert.equal(normalizeName("Jan\t\nNovak"), "jan novak");
});

test("normalizeName: keeps digits", () => {
  assert.equal(normalizeName("Firma 24/7 s.r.o."), "firma 24 7 s r o");
});

test("normalizeName: empty input stays empty", () => {
  assert.equal(normalizeName(""), "");
});

test("normalizeName: punctuation-only input collapses to empty", () => {
  assert.equal(normalizeName("---"), "");
  assert.equal(normalizeName(" .,;!? "), "");
});

// --- nameTokens --------------------------------------------------------------

test("nameTokens: splits a normalized string into tokens", () => {
  assert.deepEqual(nameTokens("jan novak"), ["jan", "novak"]);
});

test("nameTokens: drops empty tokens from extra spaces", () => {
  assert.deepEqual(nameTokens("jan  novak"), ["jan", "novak"]);
  assert.deepEqual(nameTokens(" jan novak "), ["jan", "novak"]);
});

test("nameTokens: empty string yields no tokens", () => {
  assert.deepEqual(nameTokens(""), []);
});

test("nameTokens: single token", () => {
  assert.deepEqual(nameTokens("novak"), ["novak"]);
});
