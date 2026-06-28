import assert from "node:assert/strict";
import { test } from "node:test";

import { TaskStatus } from "@/generated/prisma/enums";

import {
  activeTaskCount,
  statusCount,
  type TaskStatusGroup,
} from "./task-counts";

const group = (status: TaskStatus, count: number): TaskStatusGroup => ({
  status,
  _count: { _all: count },
});

// --- activeTaskCount ---------------------------------------------------------

test("activeTaskCount: sums all non-COMPLETED groups", () => {
  const groups = [
    group(TaskStatus.CREATED, 3),
    group(TaskStatus.IN_PROGRESS, 5),
    group(TaskStatus.FOR_REVIEW, 2),
    group(TaskStatus.COMPLETED, 100),
  ];
  // 3 + 5 + 2; COMPLETED (100) is excluded.
  assert.equal(activeTaskCount(groups), 10);
});

test("activeTaskCount: COMPLETED is never counted", () => {
  const groups = [
    group(TaskStatus.IN_PROGRESS, 4),
    group(TaskStatus.COMPLETED, 999),
  ];
  assert.equal(activeTaskCount(groups), 4);
});

test("activeTaskCount: empty groups => 0", () => {
  assert.equal(activeTaskCount([]), 0);
});

test("activeTaskCount: only COMPLETED => 0", () => {
  assert.equal(activeTaskCount([group(TaskStatus.COMPLETED, 42)]), 0);
});

// --- statusCount -------------------------------------------------------------

test("statusCount: returns _count._all for a present status", () => {
  const groups = [
    group(TaskStatus.CREATED, 7),
    group(TaskStatus.FOR_REVIEW, 2),
  ];
  assert.equal(statusCount(groups, TaskStatus.CREATED), 7);
  assert.equal(statusCount(groups, TaskStatus.FOR_REVIEW), 2);
});

test("statusCount: absent status => 0 (not undefined/NaN)", () => {
  const groups = [group(TaskStatus.CREATED, 7)];
  const result = statusCount(groups, TaskStatus.COMPLETED);
  assert.equal(result, 0);
  assert.equal(Number.isNaN(result), false);
  assert.notEqual(result, undefined);
});

test("statusCount: empty groups => 0", () => {
  assert.equal(statusCount([], TaskStatus.IN_PROGRESS), 0);
});

test("statusCount: explicit zero-count group is honored", () => {
  // Prisma normally omits zero groups, but if one is present it must be 0.
  const groups = [group(TaskStatus.POSTPONED, 0)];
  assert.equal(statusCount(groups, TaskStatus.POSTPONED), 0);
});
