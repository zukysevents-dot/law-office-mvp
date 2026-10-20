import assert from "node:assert/strict";
import { test } from "node:test";

import { diffChildRows, rowChanged } from "./child-rows";

test("diffChildRows: create / update / remove", () => {
  const diff = diffChildRows(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    [
      { id: "a", value: "1" },
      { id: null, value: "new" },
      { id: "c", value: "3" },
    ],
  );
  assert.deepEqual(diff.update.map((r) => r.id), ["a", "c"]);
  assert.deepEqual(diff.create, [{ value: "new" }]);
  assert.deepEqual(diff.remove, ["b"]);
});

test("diffChildRows: a foreign id is created as a new row, never updated", () => {
  const diff = diffChildRows([{ id: "mine" }], [{ id: "someone-elses", value: "x" }]);
  assert.deepEqual(diff.update, []);
  assert.deepEqual(diff.create, [{ value: "x" }]);
  assert.deepEqual(diff.remove, ["mine"]);
});

test("diffChildRows: a duplicated id updates once, the copy is created", () => {
  const diff = diffChildRows([{ id: "a" }], [
    { id: "a", value: "1" },
    { id: "a", value: "2" },
  ]);
  assert.equal(diff.update.length, 1);
  assert.deepEqual(diff.create, [{ value: "2" }]);
  assert.deepEqual(diff.remove, []);
});

test("rowChanged: compares values and dates", () => {
  const before = { value: "a", at: new Date("2024-01-01"), label: null as string | null };
  assert.equal(rowChanged(before, { value: "a", at: new Date("2024-01-01"), label: null }, ["value", "at", "label"]), false);
  assert.equal(rowChanged(before, { value: "b" }, ["value"]), true);
  assert.equal(rowChanged(before, { at: null as unknown as Date }, ["at"]), true);
  assert.equal(rowChanged(before, { label: "x" }, ["label"]), true);
});
