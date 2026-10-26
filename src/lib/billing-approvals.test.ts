import assert from "node:assert/strict";
import test from "node:test";

import { ApprovalStatus, BillingStatus, UserRole } from "@/generated/prisma/enums";

import {
  APPROVAL_BULK_LIMIT,
  APPROVAL_QUERY_MAX,
  ApprovalSelectionError,
  EMPTY_APPROVAL_FILTERS,
  applyApprovalDecision,
  approvalFilterQuery,
  approvalFilterWhere,
  approvalScopeWhere,
  approverDecisionWhere,
  bulkDecisionMessage,
  formatHoursTotal,
  formatItemCount,
  formatItemCountAccusative,
  hasApprovalFilters,
  parseBulkWorkLogIds,
  readApprovalFilters,
} from "./billing-approvals";

const reader = (values: Record<string, string>) => (key: string) =>
  values[key] ?? "";

test("readApprovalFilters: prázdné parametry, neznámá fakturovatelnost, ořez q", () => {
  assert.deepEqual(readApprovalFilters(reader({})), EMPTY_APPROVAL_FILTERS);
  assert.equal(readApprovalFilters(reader({ billable: "NOPE" })).billable, "");
  assert.equal(readApprovalFilters(reader({ billable: "WRITE_OFF" })).billable, "WRITE_OFF");
  const long = "x".repeat(APPROVAL_QUERY_MAX + 50);
  assert.equal(readApprovalFilters(reader({ q: `  ${long}` })).q.length, APPROVAL_QUERY_MAX);
  assert.equal(readApprovalFilters(reader({ q: "  smlouva " })).q, "smlouva");
});

test("approvalFilterWhere: bez filtrů nic nepřidá", () => {
  assert.deepEqual(approvalFilterWhere(EMPTY_APPROVAL_FILTERS), {});
  assert.equal(hasApprovalFilters(EMPTY_APPROVAL_FILTERS), false);
});

test("approvalFilterWhere: klient přes subjekt, projekt i případ (legacy výkazy)", () => {
  assert.deepEqual(
    approvalFilterWhere({ ...EMPTY_APPROVAL_FILTERS, subjectId: "s1" }),
    {
      OR: [
        { subjectId: "s1" },
        { project: { is: { mainSubjectId: "s1" } } },
        { case: { is: { project: { is: { mainSubjectId: "s1" } } } } },
      ],
    },
  );
});

test("approvalFilterWhere: projekt i přes případ, případ a pracovník přímo", () => {
  assert.deepEqual(
    approvalFilterWhere({
      ...EMPTY_APPROVAL_FILTERS,
      projectId: "p1",
      caseId: "c1",
      userId: "u1",
    }),
    {
      AND: [
        { OR: [{ projectId: "p1" }, { case: { is: { projectId: "p1" } } }] },
        { caseId: "c1" },
        { userId: "u1" },
      ],
    },
  );
});

test("approvalFilterWhere: fakturovatelnost", () => {
  assert.deepEqual(
    approvalFilterWhere({ ...EMPTY_APPROVAL_FILTERS, billable: "BILLABLE" }),
    {
      billingStatus: {
        in: [BillingStatus.BILLABLE, BillingStatus.NEEDS_APPROVAL],
      },
    },
  );
  assert.deepEqual(
    approvalFilterWhere({ ...EMPTY_APPROVAL_FILTERS, billable: "WRITE_OFF" }),
    {
      billingStatus: {
        in: [BillingStatus.VISIBLE_WRITE_OFF, BillingStatus.HIDDEN_WRITE_OFF],
      },
    },
  );
});

test("approvalFilterWhere: datumové hranice, nevalidní datum se ignoruje", () => {
  assert.deepEqual(
    approvalFilterWhere({
      ...EMPTY_APPROVAL_FILTERS,
      dateFrom: "2031-02-14",
      dateTo: "2031-02-14",
    }),
    {
      workDate: {
        gte: new Date("2031-02-14T00:00:00.000Z"),
        lte: new Date("2031-02-14T23:59:59.999Z"),
      },
    },
  );
  assert.deepEqual(
    approvalFilterWhere({ ...EMPTY_APPROVAL_FILTERS, dateFrom: "14.2.2031" }),
    {},
  );
});

test("approvalFilterWhere: popis obsahuje (bez ohledu na velikost písmen)", () => {
  assert.deepEqual(
    approvalFilterWhere({ ...EMPTY_APPROVAL_FILTERS, q: "Smlouva" }),
    { description: { contains: "Smlouva", mode: "insensitive" } },
  );
});

test("approvalFilterQuery zachová jen vyplněné filtry", () => {
  assert.equal(
    approvalFilterQuery({ subjectId: "s1", dateFrom: "2031-02-14", q: "" }),
    "subjectId=s1&dateFrom=2031-02-14",
  );
  assert.equal(approvalFilterQuery({}), "");
});

const admin = { id: "a", role: UserRole.ADMIN, organizationId: "org-1" };
const lawyer = { id: "l", role: UserRole.LAWYER, organizationId: "org-1" };
const trainee = { id: "t", role: UserRole.TRAINEE, organizationId: "org-1" };

test("approvalScopeWhere: vždy organizace a čekající stav", () => {
  for (const [user, access] of [
    [admin, { canApproveAll: true, canApprove: true }],
    [lawyer, { canApproveAll: false, canApprove: true }],
    [trainee, { canApproveAll: false, canApprove: false }],
  ] as const) {
    const json = JSON.stringify(approvalScopeWhere(user, access));
    assert.match(json, /"organizationId":"org-1"/);
    assert.match(json, /"approvalStatus":\{"in":\["DRAFT","SUBMITTED","ADJUSTED"\]\}/);
  }
});

test("approvalScopeWhere: schvalovatel jen přiřazení klienti, ostatní jen své položky", () => {
  const approverJson = JSON.stringify(
    approvalScopeWhere(lawyer, { canApproveAll: false, canApprove: true }),
  );
  assert.match(approverJson, /billingApprovers/);
  assert.match(approverJson, /"userId":"l"/);

  const adminJson = JSON.stringify(
    approvalScopeWhere(admin, { canApproveAll: true, canApprove: true }),
  );
  assert.doesNotMatch(adminJson, /billingApprovers/);

  const ownJson = JSON.stringify(
    approvalScopeWhere(trainee, { canApproveAll: false, canApprove: false }),
  );
  assert.doesNotMatch(ownJson, /billingApprovers/);
  assert.match(ownJson, /"userId":"t"/);
});

test("approverDecisionWhere: bez oprávnění null, jinak org (+ scope schvalovatele)", () => {
  assert.equal(
    approverDecisionWhere(trainee, { canApproveAll: false, canApprove: false }),
    null,
  );
  assert.deepEqual(
    approverDecisionWhere(admin, { canApproveAll: true, canApprove: true }),
    { organizationId: "org-1" },
  );
  assert.match(
    JSON.stringify(
      approverDecisionWhere(lawyer, { canApproveAll: false, canApprove: true }),
    ),
    /billingApprovers/,
  );
});

function formWithIds(ids: string[]) {
  const formData = new FormData();
  for (const id of ids) {
    formData.append("workLogId", id);
  }
  return formData;
}

test("parseBulkWorkLogIds: dedupe, prázdné pryč, 0 a nad limit je chyba", () => {
  assert.deepEqual(parseBulkWorkLogIds(formWithIds(["a", "b", "a", " ", ""])), [
    "a",
    "b",
  ]);
  assert.throws(
    () => parseBulkWorkLogIds(formWithIds([])),
    (error) =>
      error instanceof ApprovalSelectionError &&
      error.message === "Vyberte alespoň jednu položku.",
  );
  const tooMany = Array.from({ length: APPROVAL_BULK_LIMIT + 1 }, (_, i) => `id-${i}`);
  assert.throws(
    () => parseBulkWorkLogIds(formWithIds(tooMany)),
    /nejvýše 500 položek/,
  );
  assert.equal(
    parseBulkWorkLogIds(formWithIds(tooMany.slice(0, APPROVAL_BULK_LIMIT))).length,
    APPROVAL_BULK_LIMIT,
  );
});

const pending = {
  hours: "1.50",
  hourlyRate: "2000.00",
  description: "Revize smlouvy",
  billingStatus: BillingStatus.BILLABLE,
  approvalStatus: ApprovalStatus.SUBMITTED,
  archivedAt: null,
};
const now = new Date("2031-02-14T10:00:00.000Z");

test("applyApprovalDecision APPROVE bez úprav ponechá uložené hodnoty", () => {
  assert.deepEqual(applyApprovalDecision(pending, "APPROVE", undefined, now), {
    hours: 1.5,
    hourlyRate: 2000,
    amountCzk: 3000,
    description: "Revize smlouvy",
    billingStatus: BillingStatus.BILLABLE,
    approvalStatus: ApprovalStatus.APPROVED,
    archivedAt: null,
  });
});

test("applyApprovalDecision APPROVE s úpravami z karty", () => {
  assert.deepEqual(
    applyApprovalDecision(
      { ...pending, billingStatus: BillingStatus.NEEDS_APPROVAL },
      "APPROVE",
      { hours: 2, hourlyRate: 2500, description: "Nový popis", userId: "u2" },
      now,
    ),
    {
      hours: 2,
      hourlyRate: 2500,
      amountCzk: 5000,
      description: "Nový popis",
      userId: "u2",
      billingStatus: BillingStatus.BILLABLE,
      approvalStatus: ApprovalStatus.APPROVED,
      archivedAt: null,
    },
  );
});

test("applyApprovalDecision REJECT zachová billing status", () => {
  const result = applyApprovalDecision(
    { ...pending, billingStatus: BillingStatus.VISIBLE_WRITE_OFF },
    "REJECT",
    undefined,
    now,
  );
  assert.equal(result.approvalStatus, ApprovalStatus.REJECTED);
  assert.equal(result.billingStatus, BillingStatus.VISIBLE_WRITE_OFF);
  assert.equal(result.archivedAt, null);
});

test("applyApprovalDecision odpisy", () => {
  const hidden = applyApprovalDecision(pending, "HIDDEN_WRITE_OFF", undefined, now);
  assert.equal(hidden.billingStatus, BillingStatus.HIDDEN_WRITE_OFF);
  assert.equal(hidden.approvalStatus, ApprovalStatus.APPROVED);
  assert.deepEqual(hidden.archivedAt, now);

  const visible = applyApprovalDecision(pending, "VISIBLE_WRITE_OFF", undefined, now);
  assert.equal(visible.billingStatus, BillingStatus.VISIBLE_WRITE_OFF);
  assert.equal(visible.amountCzk, 0);
  assert.equal(visible.archivedAt, null);
});

test("applyApprovalDecision bez sazby nemá částku", () => {
  assert.equal(
    applyApprovalDecision({ ...pending, hourlyRate: null }, "APPROVE", undefined, now)
      .amountCzk,
    null,
  );
});

test("formatItemCount: česká plurálka", () => {
  assert.equal(formatItemCount(1), "1 položka");
  assert.equal(formatItemCount(2), "2 položky");
  assert.equal(formatItemCount(4), "4 položky");
  assert.equal(formatItemCount(5), "5 položek");
  assert.equal(formatItemCount(12), "12 položek");
  assert.equal(formatItemCount(22), "22 položky");
  assert.equal(formatItemCount(0), "0 položek");
});

test("formatHoursTotal a hláška hromadného rozhodnutí", () => {
  assert.equal(formatHoursTotal(3), "3,00 h");
  assert.equal(formatHoursTotal(7.5), "7,50 h");
  assert.equal(bulkDecisionMessage("APPROVE", 1), "Schválena 1 položka.");
  assert.equal(bulkDecisionMessage("APPROVE", 2), "Schváleny 2 položky.");
  assert.equal(bulkDecisionMessage("APPROVE", 5), "Schváleno 5 položek.");
  assert.equal(bulkDecisionMessage("REJECT", 1), "Zamítnuta 1 položka.");
  assert.equal(bulkDecisionMessage("REJECT", 3), "Zamítnuty 3 položky.");
  assert.equal(bulkDecisionMessage("REJECT", 5), "Zamítnuto 5 položek.");
  assert.equal(formatItemCountAccusative(1), "1 položku");
  assert.equal(formatItemCountAccusative(3), "3 položky");
  assert.equal(formatItemCountAccusative(11), "11 položek");
});
