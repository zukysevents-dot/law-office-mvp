import assert from "node:assert/strict";
import { test } from "node:test";

import { DashboardWidgetType } from "@/generated/prisma/enums";

import {
  getDefaultDashboardColumns,
  getVisibleDashboardColumns,
  isDashboardTableWidget,
  parseDashboardLayoutPayload,
} from "./dashboard-widgets";

const TABLE = DashboardWidgetType.MY_TASKS_TABLE;
const STAT = DashboardWidgetType.ACTIVE_TASKS;

// --- parseDashboardLayoutPayload ---------------------------------------------

test("parseDashboardLayoutPayload: validní pole se rozparsuje", () => {
  const items = parseDashboardLayoutPayload(
    JSON.stringify([
      { id: "a", title: "Widget A", size: "LARGE", visible: true, columns: ["x"] },
      { id: "b", title: "B", size: "SMALL", visible: false, columns: [] },
    ]),
  );
  assert.equal(items?.length, 2);
  assert.deepEqual(items?.[0], {
    id: "a",
    title: "Widget A",
    size: "LARGE",
    visible: true,
    columns: ["x"],
  });
  assert.equal(items?.[1].visible, false);
});

test("parseDashboardLayoutPayload: nevalidní JSON → null", () => {
  assert.equal(parseDashboardLayoutPayload("{neplatne"), null);
});

test("parseDashboardLayoutPayload: ne-pole → null", () => {
  assert.equal(parseDashboardLayoutPayload(JSON.stringify({ id: "a" })), null);
});

test("parseDashboardLayoutPayload: položka bez id (nebo prázdné id) → null", () => {
  assert.equal(parseDashboardLayoutPayload(JSON.stringify([{ title: "x" }])), null);
  assert.equal(parseDashboardLayoutPayload(JSON.stringify([{ id: "" }])), null);
});

test("parseDashboardLayoutPayload: chybějící/špatné typy polí → bezpečné defaulty", () => {
  const items = parseDashboardLayoutPayload(JSON.stringify([{ id: "a" }]));
  assert.deepEqual(items, [
    { id: "a", title: "", size: "", visible: false, columns: [] },
  ]);
});

test("parseDashboardLayoutPayload: visible je true jen pro striktní true", () => {
  const items = parseDashboardLayoutPayload(
    JSON.stringify([{ id: "a", visible: "true" }]),
  );
  assert.equal(items?.[0].visible, false);
});

test("parseDashboardLayoutPayload: ne-string položky ve columns se odfiltrují", () => {
  const items = parseDashboardLayoutPayload(
    JSON.stringify([{ id: "a", columns: ["x", 1, null, "y"] }]),
  );
  assert.deepEqual(items?.[0].columns, ["x", "y"]);
});

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
