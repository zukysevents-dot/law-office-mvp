import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkLogDuplicatePrefill,
  todayDateInputValue,
  type WorkLogDuplicateAllowed,
  type WorkLogDuplicateSource,
} from "./duplicate";

const source: WorkLogDuplicateSource = {
  subjectId: "s1",
  projectId: "p1",
  caseId: "c1",
  taskId: "t1",
  hours: "1.50",
  hourlyRate: "2500.00",
  billingStatus: "BILLABLE",
  legalArea: "Obchodní právo",
  internalCategory: null,
  description: "Revize smlouvy",
  workDate: new Date("2026-07-15T00:00:00.000Z"),
};

const allowed: WorkLogDuplicateAllowed = {
  subjectIds: new Set(["s1"]),
  projectIds: new Set(["p1"]),
  caseIds: new Set(["c1"]),
  tasks: new Map([
    ["t1", { projectId: "p1", caseId: "c1" }],
    ["tProject", { projectId: "p1", caseId: null }],
    ["tFree", { projectId: null, caseId: null }],
  ]),
};

test("kopie převezme spis, hodiny, kategorii a popis", () => {
  const prefill = buildWorkLogDuplicatePrefill(source, allowed, true);
  assert.deepEqual(prefill, {
    subjectId: "s1",
    projectId: "p1",
    caseId: "c1",
    taskId: "t1",
    hours: "1.5",
    hourlyRate: "2500",
    billingStatus: "BILLABLE",
    legalArea: "Obchodní právo",
    internalCategory: "",
    description: "Revize smlouvy",
    sourceDate: source.workDate,
  });
});

test("datum, schválení, fakturační vazba ani autor se nepřenáší", () => {
  const prefill = buildWorkLogDuplicatePrefill(
    {
      ...source,
      // Pole, která zdroj v DB má, se do předvyplnění nesmí dostat.
      ...({
        approvalStatus: "APPROVED",
        invoicedAt: new Date(),
        invoicedInvoiceId: "inv-1",
        userId: "someone",
      } as object),
    },
    allowed,
    true,
  );
  for (const key of ["approvalStatus", "invoicedAt", "invoicedInvoiceId", "userId", "workDate"]) {
    assert.equal(key in prefill, false, key);
  }
});

test("sazba jen pro role, které smějí vidět sazby", () => {
  assert.equal(buildWorkLogDuplicatePrefill(source, allowed, false).hourlyRate, "");
  assert.equal(
    buildWorkLogDuplicatePrefill({ ...source, hourlyRate: null }, allowed, true)
      .hourlyRate,
    "",
  );
});

test("odpis i legacy NEEDS_APPROVAL se zkopírují jako fakturovatelné", () => {
  for (const status of ["VISIBLE_WRITE_OFF", "HIDDEN_WRITE_OFF", "NEEDS_APPROVAL"]) {
    const prefill = buildWorkLogDuplicatePrefill(
      { ...source, billingStatus: status },
      allowed,
      true,
    );
    assert.equal(prefill.billingStatus, "BILLABLE");
    assert.equal(prefill.legalArea, "Obchodní právo");
  }
});

test("interní výkaz zachová interní kategorii a zahodí právní oblast", () => {
  const prefill = buildWorkLogDuplicatePrefill(
    {
      ...source,
      billingStatus: "INTERNAL_NON_BILLABLE",
      internalCategory: "ADMINISTRATION",
      legalArea: "Obchodní právo",
    },
    allowed,
    true,
  );
  assert.equal(prefill.billingStatus, "INTERNAL_NON_BILLABLE");
  assert.equal(prefill.internalCategory, "ADMINISTRATION");
  assert.equal(prefill.legalArea, "");
});

test("neviditelný projekt zahodí projekt, případ i úkol spisu", () => {
  const prefill = buildWorkLogDuplicatePrefill(
    source,
    { ...allowed, projectIds: new Set() },
    true,
  );
  assert.equal(prefill.projectId, "");
  assert.equal(prefill.caseId, "");
  assert.equal(prefill.taskId, "");
  assert.equal(prefill.subjectId, "s1");
});

test("neviditelný případ zahodí případ a jeho úkol, projektový úkol zůstane", () => {
  const narrowed = { ...allowed, caseIds: new Set<string>() };
  const caseTask = buildWorkLogDuplicatePrefill(source, narrowed, true);
  assert.equal(caseTask.projectId, "p1");
  assert.equal(caseTask.caseId, "");
  assert.equal(caseTask.taskId, "");

  const projectTask = buildWorkLogDuplicatePrefill(
    { ...source, taskId: "tProject" },
    narrowed,
    true,
  );
  assert.equal(projectTask.taskId, "tProject");
});

test("archivovaný úkol ani subjekt se nepředvyplní", () => {
  const prefill = buildWorkLogDuplicatePrefill(
    { ...source, subjectId: "gone", projectId: null, caseId: null, taskId: "gone" },
    allowed,
    true,
  );
  assert.equal(prefill.subjectId, "");
  assert.equal(prefill.taskId, "");
});

test("dnešní datum se počítá v Europe/Prague", () => {
  // 31. 3. 22:30 UTC = 1. 4. 0:30 SELČ.
  assert.equal(todayDateInputValue(new Date("2026-03-31T22:30:00Z")), "2026-04-01");
  // 15. 1. 23:30 UTC = 16. 1. 0:30 SEČ.
  assert.equal(todayDateInputValue(new Date("2026-01-15T23:30:00Z")), "2026-01-16");
  assert.equal(todayDateInputValue(new Date("2026-01-15T12:00:00Z")), "2026-01-15");
});
