import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeVisibleColumns,
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
