import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getDefaultTableColumns,
  normalizeVisibleColumns,
  tableViewConfigs,
  type TableColumnDefinition,
} from "./table-view-preferences";

const cols: TableColumnDefinition[] = [
  { id: "a", label: "A", defaultVisible: true },
  { id: "b", label: "B", defaultVisible: true },
  { id: "c", label: "C", defaultVisible: false },
];
const defaults = ["a", "b"];

test("normalizeVisibleColumns: keeps a valid saved subset", () => {
  assert.deepEqual(normalizeVisibleColumns(["b"], cols, defaults), ["b"]);
});

test("normalizeVisibleColumns: re-orders to the canonical column order", () => {
  assert.deepEqual(normalizeVisibleColumns(["c", "a"], cols, defaults), ["a", "c"]);
});

test("normalizeVisibleColumns: stale saved column → merge defaults back in", () => {
  assert.deepEqual(normalizeVisibleColumns(["a", "zzz"], cols, defaults), ["a", "b"]);
});

test("normalizeVisibleColumns: non-array saved value → defaults", () => {
  assert.deepEqual(normalizeVisibleColumns(null, cols, defaults), ["a", "b"]);
  assert.deepEqual(normalizeVisibleColumns("nope", cols, defaults), ["a", "b"]);
});

test("normalizeVisibleColumns: empty or all-stale selection → defaults", () => {
  assert.deepEqual(normalizeVisibleColumns([], cols, defaults), ["a", "b"]);
  assert.deepEqual(normalizeVisibleColumns(["zzz"], cols, defaults), ["a", "b"]);
});

test("normalizeVisibleColumns: a column introduced later is added to older saved selections", () => {
  const withNew: TableColumnDefinition[] = [
    ...cols,
    { id: "n", label: "N", defaultVisible: true, introducedAt: "2026-10-26T00:00:00.000Z" },
  ];
  const before = new Date("2026-10-01T10:00:00.000Z");
  const after = new Date("2026-10-27T10:00:00.000Z");
  assert.deepEqual(normalizeVisibleColumns(["a"], withNew, defaults, before), ["a", "n"]);
  // Výběr uložený po zavedení sloupce je vědomá volba — sloupec se nepřidá.
  assert.deepEqual(normalizeVisibleColumns(["a"], withNew, defaults, after), ["a"]);
  // Bez data (ukládání) se nic nepřidává.
  assert.deepEqual(normalizeVisibleColumns(["a"], withNew, defaults), ["a"]);
});

test("projects and cases tables show the Řešitelé column by default, right after the responsible user", () => {
  for (const key of ["projects", "cases"] as const) {
    const ids = tableViewConfigs[key].columns.map((column) => column.id);
    assert.equal(ids[ids.indexOf("responsibleUser") + 1], "assignees", key);
    assert.ok(getDefaultTableColumns(key).includes("assignees"), key);
  }
});
