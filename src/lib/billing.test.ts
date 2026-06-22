import assert from "node:assert/strict";
import { test } from "node:test";

import {
  billingFilterWhere,
  readBillingFilters,
  type BillingFilters,
} from "./billing";

function filters(o: Partial<BillingFilters> = {}): BillingFilters {
  return {
    subjectId: "",
    projectId: "",
    caseId: "",
    userId: "",
    dateFrom: "",
    dateTo: "",
    ...o,
  };
}

test("billingFilterWhere: no filters → empty where", () => {
  assert.deepEqual(billingFilterWhere(filters()), {});
});

test("billingFilterWhere: scalar filters map to equality clauses", () => {
  assert.deepEqual(billingFilterWhere(filters({ subjectId: "s1", userId: "u1" })), {
    subjectId: "s1",
    userId: "u1",
  });
});

type DateRange = { gte?: Date; lte?: Date } | undefined;

test("billingFilterWhere: valid dates produce UTC day-boundary range", () => {
  const wd = billingFilterWhere(filters({ dateFrom: "2026-01-01", dateTo: "2026-01-31" }))
    .workDate as DateRange;
  assert.equal(wd?.gte?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(wd?.lte?.toISOString(), "2026-01-31T23:59:59.999Z");
});

test("billingFilterWhere: dateFrom only → gte only, no lte", () => {
  const wd = billingFilterWhere(filters({ dateFrom: "2026-01-01" })).workDate as DateRange;
  assert.equal(wd?.gte?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(wd?.lte, undefined);
});

test("billingFilterWhere: malformed date is dropped, not passed to Prisma", () => {
  assert.deepEqual(billingFilterWhere(filters({ dateFrom: "garbage" })), {});
});

test("readBillingFilters: reads each key, defaults to empty string", () => {
  const source: Record<string, string> = { subjectId: "s1", dateTo: "2026-02-01" };
  const f = readBillingFilters((k) => source[k] ?? "");
  assert.equal(f.subjectId, "s1");
  assert.equal(f.dateTo, "2026-02-01");
  assert.equal(f.projectId, "");
});
