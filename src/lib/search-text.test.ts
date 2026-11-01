import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterBySearch,
  matchesSearch,
  normalizeSearchText,
  searchTokens,
} from "./search-text";

test("normalizeSearchText: bez diakritiky, malá písmena, mezery", () => {
  assert.equal(normalizeSearchText("  Dobrá   FIRMA s.r.o. "), "dobra firma s.r.o.");
  assert.equal(normalizeSearchText("Žluťoučký kůň úpěl ďábelské ódy"), "zlutoucky kun upel dabelske ody");
  assert.equal(normalizeSearchText("ŘEŠITEL Čížek"), "resitel cizek");
});

test("searchTokens: prázdný dotaz → žádná slova", () => {
  assert.deepEqual(searchTokens("   "), []);
  assert.deepEqual(searchTokens("Jan  Novák"), ["jan", "novak"]);
});

test("matchesSearch: hledá kdekoli v textu, ne jen od začátku", () => {
  // Příklad ze zpětné vazby: druhé slovo názvu.
  assert.equal(matchesSearch("Dobrá firma s.r.o.", "firma"), true);
  assert.equal(matchesSearch("Dobrá firma s.r.o.", "FIRMA"), true);
  assert.equal(matchesSearch("Dobrá firma s.r.o.", "dobra"), true);
  // Uprostřed slova.
  assert.equal(matchesSearch("Novákovi", "vák"), true);
  assert.equal(matchesSearch("Dobrá firma s.r.o.", "jiná"), false);
});

test("matchesSearch: diakritika v dotazu i v textu je jedno", () => {
  assert.equal(matchesSearch("Jan Novák", "novak"), true);
  assert.equal(matchesSearch("Jan Novak", "Novák"), true);
  assert.equal(matchesSearch("Žaloba na zaplacení", "zaloba"), true);
});

test("matchesSearch: všechna slova dotazu, libovolné pořadí", () => {
  assert.equal(matchesSearch("Jan Novák", "novák jan"), true);
  assert.equal(matchesSearch("Jan Novák", "novák petr"), false);
  assert.equal(matchesSearch("ABC s.r.o., IČO 12345678", "abc 4567"), true);
});

test("matchesSearch: prázdný dotaz projde vše", () => {
  assert.equal(matchesSearch("cokoli", ""), true);
  assert.equal(matchesSearch("cokoli", "   "), true);
});

test("filterBySearch: zachová pořadí a hledá v textOf", () => {
  const items = [
    { id: "1", name: "ABC s.r.o.", ico: "12345678" },
    { id: "2", name: "Dobrá firma s.r.o.", ico: null },
    { id: "3", name: "Firma Plus a.s.", ico: "87654321" },
  ];
  const textOf = (item: (typeof items)[number]) =>
    `${item.name} ${item.ico ?? ""}`;
  assert.deepEqual(
    filterBySearch(items, "firma", textOf).map((item) => item.id),
    ["2", "3"],
  );
  assert.deepEqual(
    filterBySearch(items, "8765", textOf).map((item) => item.id),
    ["3"],
  );
  assert.deepEqual(
    filterBySearch(items, "", textOf).map((item) => item.id),
    ["1", "2", "3"],
  );
});
