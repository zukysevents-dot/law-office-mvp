import assert from "node:assert/strict";
import { test } from "node:test";

import {
  initialActiveIndex,
  itemValue,
  namedSelectOption,
  searchableSelectItems,
  subjectSelectOption,
  type SearchableSelectOption,
} from "./searchable-select";

const subjects: SearchableSelectOption[] = [
  { value: "1", label: "ABC s.r.o., IČO 12345678" },
  { value: "2", label: "Dobrá firma s.r.o." },
  { value: "3", label: "Jan Novák", keywords: "RČ nic" },
  { value: "4", label: "Žaloba na zaplacení", description: "Soudní spor ABC" },
];

test("searchableSelectItems: bez dotazu prázdná volba + vše", () => {
  const { items, hidden } = searchableSelectItems(subjects, "", {
    emptyLabel: "Bez projektu",
  });
  assert.equal(hidden, 0);
  assert.deepEqual(items.map(itemValue), ["", "1", "2", "3", "4"]);
  assert.equal(items[0].kind, "empty");
});

test("searchableSelectItems: s dotazem jen shody a bez prázdné volby", () => {
  const { items } = searchableSelectItems(subjects, "firma", {
    emptyLabel: "Bez projektu",
  });
  assert.deepEqual(items.map(itemValue), ["2"]);
});

test("searchableSelectItems: hledá i v popisu a klíčových slovech", () => {
  assert.deepEqual(
    searchableSelectItems(subjects, "soudni spor").items.map(itemValue),
    ["4"],
  );
  assert.deepEqual(searchableSelectItems(subjects, "novak").items.map(itemValue), ["3"]);
  // ABC je v názvu subjektu 1 i v popisu případu 4.
  assert.deepEqual(searchableSelectItems(subjects, "abc").items.map(itemValue), ["1", "4"]);
});

test("searchableSelectItems: bez emptyLabel žádná prázdná volba", () => {
  assert.deepEqual(searchableSelectItems(subjects, "").items.map(itemValue), [
    "1",
    "2",
    "3",
    "4",
  ]);
});

test("searchableSelectItems: limit a počet skrytých shod", () => {
  const many = Array.from({ length: 150 }, (_, index) => ({
    value: String(index),
    label: `Subjekt ${index}`,
  }));
  const { items, hidden } = searchableSelectItems(many, "subjekt", { limit: 100 });
  assert.equal(items.length, 100);
  assert.equal(hidden, 50);
});

test("initialActiveIndex: vybraná položka, jinak první", () => {
  const { items } = searchableSelectItems(subjects, "", { emptyLabel: "—" });
  assert.equal(initialActiveIndex(items, "3", ""), 3);
  assert.equal(initialActiveIndex(items, "", ""), 0);
  assert.equal(initialActiveIndex(items, "neexistuje", ""), 0);
  assert.equal(initialActiveIndex([], "", ""), -1);
  // Při psaní se zvýrazní první shoda.
  const filtered = searchableSelectItems(subjects, "s.r.o").items;
  assert.equal(initialActiveIndex(filtered, "2", "s.r.o"), 0);
});

test("subjectSelectOption / namedSelectOption", () => {
  assert.deepEqual(subjectSelectOption({ id: "1", name: "ABC s.r.o.", ico: "12345678" }), {
    value: "1",
    label: "ABC s.r.o., IČO 12345678",
  });
  assert.deepEqual(subjectSelectOption({ id: "2", name: "Jan Novák", ico: null }), {
    value: "2",
    label: "Jan Novák",
  });
  assert.deepEqual(namedSelectOption({ id: "p", name: "Projekt" }), {
    value: "p",
    label: "Projekt",
  });
});
