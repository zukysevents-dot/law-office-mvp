import assert from "node:assert/strict";
import { test } from "node:test";

import { DashboardWidgetType } from "@/generated/prisma/enums";

import {
  getDefaultDashboardColumns,
  getVisibleDashboardColumns,
  isDashboardTableWidget,
} from "./dashboard-widgets";

const TABLE = DashboardWidgetType.MY_TASKS_TABLE;
const STAT = DashboardWidgetType.ACTIVE_TASKS;

test("isDashboardTableWidget: true for table widgets, false for stat widgets", () => {
  assert.equal(isDashboardTableWidget(TABLE), true);
  assert.equal(isDashboardTableWidget(STAT), false);
});

test("getDefaultDashboardColumns: defaults for table widget, empty for stat widget", () => {
  assert.deepEqual(getDefaultDashboardColumns(TABLE), [
    "title",
    "subject",
    "status",
    "deadline",
    "responsibleUser",
  ]);
  assert.deepEqual(getDefaultDashboardColumns(STAT), []);
});

test("getVisibleDashboardColumns: keeps a valid configured subset", () => {
  assert.deepEqual(
    getVisibleDashboardColumns(TABLE, { columns: ["title", "status"] }),
    ["title", "status"],
  );
});

test("getVisibleDashboardColumns: filters out unknown columns", () => {
  assert.deepEqual(
    getVisibleDashboardColumns(TABLE, { columns: ["title", "bogus"] }),
    ["title"],
  );
});

test("getVisibleDashboardColumns: falls back to defaults on empty/invalid config", () => {
  const defaults = getDefaultDashboardColumns(TABLE);
  assert.deepEqual(getVisibleDashboardColumns(TABLE, { columns: ["bogus"] }), defaults);
  assert.deepEqual(getVisibleDashboardColumns(TABLE, null), defaults);
  assert.deepEqual(getVisibleDashboardColumns(TABLE, { columns: "not-array" }), defaults);
});

test("getVisibleDashboardColumns: stat widget has no columns", () => {
  assert.deepEqual(getVisibleDashboardColumns(STAT, { columns: ["x"] }), []);
});
