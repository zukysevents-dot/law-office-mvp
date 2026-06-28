import assert from "node:assert/strict";
import { test } from "node:test";

import { applyTaskLimit } from "./list-truncation";

// applyTaskLimit pairs with a `take: limit + 1` query: the helper sees up to
// limit + 1 rows and must trim back to exactly `limit` only when overflowing.

test("length < limit => not truncated, returns the whole array", () => {
  const rows = [1, 2, 3];
  const result = applyTaskLimit(rows, 5);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.visible, [1, 2, 3]);
});

test("length === limit => not truncated, returns everything (no false positive)", () => {
  const rows = [1, 2, 3, 4, 5];
  const result = applyTaskLimit(rows, 5);
  assert.equal(result.truncated, false);
  assert.equal(result.visible.length, 5);
  assert.deepEqual(result.visible, [1, 2, 3, 4, 5]);
});

test("length === limit + 1 => truncated, drops exactly one extra row", () => {
  const rows = [1, 2, 3, 4, 5, 6];
  const result = applyTaskLimit(rows, 5);
  assert.equal(result.truncated, true);
  assert.equal(result.visible.length, 5);
  assert.deepEqual(result.visible, [1, 2, 3, 4, 5]);
});

test("visible preserves order and the leading elements", () => {
  const rows = ["a", "b", "c", "d"];
  const result = applyTaskLimit(rows, 2);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.visible, ["a", "b"]);
});

test("empty array => not truncated, empty visible", () => {
  const result = applyTaskLimit<number>([], 5);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.visible, []);
});

test("many extra rows still trim back to exactly limit", () => {
  const rows = Array.from({ length: 20 }, (_, i) => i);
  const result = applyTaskLimit(rows, 5);
  assert.equal(result.truncated, true);
  assert.equal(result.visible.length, 5);
  assert.deepEqual(result.visible, [0, 1, 2, 3, 4]);
});
