import assert from "node:assert/strict";
import { test } from "node:test";

import { archiveFilterValue, archivedWhere } from "./archive-filter";

test("archiveFilterValue: accepts archived/all, defaults everything else to active", () => {
  assert.equal(archiveFilterValue("archived"), "archived");
  assert.equal(archiveFilterValue("all"), "all");
  assert.equal(archiveFilterValue("active"), "active");
  assert.equal(archiveFilterValue(undefined), "active");
  assert.equal(archiveFilterValue("garbage"), "active");
});

test("archivedWhere: maps each filter to the right Prisma clause", () => {
  assert.deepEqual(archivedWhere("active"), { archivedAt: null });
  assert.deepEqual(archivedWhere("archived"), { archivedAt: { not: null } });
  assert.deepEqual(archivedWhere("all"), {});
});
