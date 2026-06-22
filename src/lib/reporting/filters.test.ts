import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readReportFilters,
  workLogReportWhere,
  type ReportFilters,
} from "./filters";

function filters(o: Partial<ReportFilters> = {}): ReportFilters {
  return {
    subjectId: "",
    projectId: "",
    caseId: "",
    userId: "",
    legalArea: "",
    dateFrom: "",
    dateTo: "",
    ...o,
  };
}

type DateRange = { gte?: Date; lte?: Date } | undefined;

test("workLogReportWhere: always scopes to non-archived rows", () => {
  assert.deepEqual(workLogReportWhere(filters()), { archivedAt: null });
});

test("workLogReportWhere: includes legalArea and scalar filters", () => {
  assert.deepEqual(workLogReportWhere(filters({ legalArea: "Civilní", subjectId: "s1" })), {
    archivedAt: null,
    subjectId: "s1",
    legalArea: "Civilní",
  });
});

test("workLogReportWhere: valid date → UTC boundary alongside archivedAt", () => {
  const where = workLogReportWhere(filters({ dateFrom: "2026-03-01" }));
  assert.equal(where.archivedAt, null);
  assert.equal((where.workDate as DateRange)?.gte?.toISOString(), "2026-03-01T00:00:00.000Z");
});

test("workLogReportWhere: malformed date dropped, archivedAt kept", () => {
  assert.deepEqual(workLogReportWhere(filters({ dateFrom: "nope" })), { archivedAt: null });
});

test("readReportFilters: reads all seven keys", () => {
  const source: Record<string, string> = { legalArea: "Trestní", userId: "u9" };
  const f = readReportFilters((k) => source[k] ?? "");
  assert.equal(f.legalArea, "Trestní");
  assert.equal(f.userId, "u9");
  assert.equal(f.caseId, "");
});
