// Pure rules of the approval queue ("Položky ke schválení") shared by
// /billing/approvals, /work-logs/approvals and the billing server actions:
// URL filters → Prisma where, the approver scope, bulk-selection parsing and
// the effect of an approval decision on a work log. Unit-tested
// (billing-approvals.test.ts); the DB-backed loader lives in
// billing-approvals.server.ts.

import type { Prisma } from "@/generated/prisma/client";
import { ApprovalStatus, BillingStatus } from "@/generated/prisma/enums";
import { pendingApprovalWorkLogWhere } from "@/lib/billing";
import {
  andWhere,
  billingApproverWorkLogWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { filterQuery, parseDateBoundary } from "@/lib/search-params";

export type ApprovalBillableFilter = "" | "BILLABLE" | "WRITE_OFF";

export type ApprovalFilters = {
  subjectId: string;
  projectId: string;
  caseId: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
  billable: ApprovalBillableFilter;
  q: string;
};

export const APPROVAL_FILTER_KEYS = [
  "subjectId",
  "projectId",
  "caseId",
  "userId",
  "dateFrom",
  "dateTo",
  "billable",
  "q",
] as const satisfies ReadonlyArray<keyof ApprovalFilters>;

export const EMPTY_APPROVAL_FILTERS: ApprovalFilters = {
  subjectId: "",
  projectId: "",
  caseId: "",
  userId: "",
  dateFrom: "",
  dateTo: "",
  billable: "",
  q: "",
};

/** Cards rendered at once (each is a client form — keep hydration light). */
export const APPROVAL_ROW_LIMIT = 500;
/** Max work logs decided by one bulk request. */
export const APPROVAL_BULK_LIMIT = 500;
/** Max length of the "Popis obsahuje" search. */
export const APPROVAL_QUERY_MAX = 200;

function billableValue(value: string): ApprovalBillableFilter {
  return value === "BILLABLE" || value === "WRITE_OFF" ? value : "";
}

export function readApprovalFilters(
  get: (key: string) => string,
): ApprovalFilters {
  return {
    subjectId: get("subjectId").trim(),
    projectId: get("projectId").trim(),
    caseId: get("caseId").trim(),
    userId: get("userId").trim(),
    dateFrom: get("dateFrom").trim(),
    dateTo: get("dateTo").trim(),
    billable: billableValue(get("billable")),
    q: get("q").trim().slice(0, APPROVAL_QUERY_MAX),
  };
}

export function approvalFilterQuery(filters: Partial<ApprovalFilters>): string {
  const flat: Record<string, string> = {};
  for (const key of APPROVAL_FILTER_KEYS) {
    flat[key] = filters[key] ?? "";
  }
  return filterQuery(flat);
}

export function hasApprovalFilters(filters: ApprovalFilters): boolean {
  return APPROVAL_FILTER_KEYS.some((key) => Boolean(filters[key]));
}

/**
 * Filter part of the queue query. The client filter also matches legacy work
 * logs that carry the client only through their project/case (the same shape
 * as billingApproverWorkLogWhere), the project filter also matches logs that
 * carry the project only through their case.
 */
export function approvalFilterWhere(
  filters: ApprovalFilters,
): Prisma.WorkLogWhereInput {
  const clauses: Prisma.WorkLogWhereInput[] = [];
  if (filters.subjectId) {
    const mainSubjectId = filters.subjectId;
    clauses.push({
      OR: [
        { subjectId: mainSubjectId },
        { project: { is: { mainSubjectId } } },
        { case: { is: { project: { is: { mainSubjectId } } } } },
      ],
    });
  }
  if (filters.projectId) {
    clauses.push({
      OR: [
        { projectId: filters.projectId },
        { case: { is: { projectId: filters.projectId } } },
      ],
    });
  }
  if (filters.caseId) {
    clauses.push({ caseId: filters.caseId });
  }
  if (filters.userId) {
    clauses.push({ userId: filters.userId });
  }
  const gte = parseDateBoundary(filters.dateFrom, false);
  const lte = parseDateBoundary(filters.dateTo, true);
  if (gte || lte) {
    clauses.push({
      workDate: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) },
    });
  }
  if (filters.billable === "BILLABLE") {
    clauses.push({
      billingStatus: {
        in: [BillingStatus.BILLABLE, BillingStatus.NEEDS_APPROVAL],
      },
    });
  } else if (filters.billable === "WRITE_OFF") {
    clauses.push({
      billingStatus: {
        in: [BillingStatus.VISIBLE_WRITE_OFF, BillingStatus.HIDDEN_WRITE_OFF],
      },
    });
  }
  const q = filters.q.trim().slice(0, APPROVAL_QUERY_MAX);
  if (q) {
    clauses.push({ description: { contains: q, mode: "insensitive" } });
  }
  return andWhere<Prisma.WorkLogWhereInput>(...clauses);
}

export type ApprovalAccess = {
  /** ADMIN / PARTNER — decide every pending item of the office. */
  canApproveAll: boolean;
  /** canApproveAll, or assigned as a billing approver of at least one client. */
  canApprove: boolean;
};

type ApprovalUser = Parameters<typeof workLogVisibilityWhere>[0] & {
  id: string;
  organizationId: string;
};

/**
 * Which pending work logs the user sees in the queue. Approvers: every pending
 * item of the office (ADMIN/PARTNER) or of the clients they approve. Anyone
 * else sees only their own pending items, read-only. Always org-scoped.
 */
export function approvalScopeWhere(
  user: ApprovalUser,
  access: ApprovalAccess,
): Prisma.WorkLogWhereInput {
  if (access.canApproveAll) {
    return andWhere(pendingApprovalWorkLogWhere, {
      organizationId: user.organizationId,
    });
  }
  if (access.canApprove) {
    return andWhere(
      pendingApprovalWorkLogWhere,
      { organizationId: user.organizationId },
      billingApproverWorkLogWhere(user.id),
    );
  }
  return andWhere(
    pendingApprovalWorkLogWhere,
    workLogVisibilityWhere(user),
    { organizationId: user.organizationId, userId: user.id },
  );
}

/**
 * The scope a decision may touch (single or bulk): only approvers, never the
 * read-only own-items view. Not limited to pending items here — callers add
 * that where the action requires it.
 */
export function approverDecisionWhere(
  user: { id: string; organizationId: string },
  access: ApprovalAccess,
): Prisma.WorkLogWhereInput | null {
  if (!access.canApprove) {
    return null;
  }
  return andWhere(
    { organizationId: user.organizationId },
    access.canApproveAll ? undefined : billingApproverWorkLogWhere(user.id),
  );
}

export class ApprovalSelectionError extends Error {}

/** Selected work-log IDs of a bulk request: non-empty strings, deduplicated. */
export function parseBulkWorkLogIds(formData: FormData): string[] {
  const ids = [
    ...new Set(
      formData
        .getAll("workLogId")
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.length <= 64),
    ),
  ];
  if (ids.length === 0) {
    throw new ApprovalSelectionError("Vyberte alespoň jednu položku.");
  }
  if (ids.length > APPROVAL_BULK_LIMIT) {
    throw new ApprovalSelectionError(
      `Najednou lze rozhodnout nejvýše ${APPROVAL_BULK_LIMIT} položek.`,
    );
  }
  return ids;
}

export type ApprovalDisposition =
  | "APPROVE"
  | "REJECT"
  | "HIDDEN_WRITE_OFF"
  | "VISIBLE_WRITE_OFF";

export const APPROVAL_DISPOSITIONS: ApprovalDisposition[] = [
  "APPROVE",
  "REJECT",
  "HIDDEN_WRITE_OFF",
  "VISIBLE_WRITE_OFF",
];

/** Write-offs stay per-card decisions (usually with edited hours/text). */
export const BULK_DISPOSITIONS: ApprovalDisposition[] = ["APPROVE", "REJECT"];

type DecimalLike = { toString(): string } | number | string;

export type ApprovalDecisionSource = {
  hours: DecimalLike;
  hourlyRate: DecimalLike | null;
  description: string | null;
  billingStatus: BillingStatus;
  approvalStatus: ApprovalStatus;
  archivedAt: Date | null;
};

export type ApprovalDecisionEdits = {
  hours: number;
  /** undefined = keep the stored rate (approver without VIEW_RATES never sees it). */
  hourlyRate?: number | null;
  description: string | null;
  userId: string | null;
};

export type ApprovalDecisionData = {
  hours: number;
  hourlyRate: number | null;
  amountCzk: number | null;
  description: string | null;
  userId?: string;
  billingStatus: BillingStatus;
  approvalStatus: ApprovalStatus;
  archivedAt: Date | null;
};

/**
 * Effect of an approval decision on a work log. With `edits` (a single card)
 * the approver's edited hours/rate/description/worker are applied; without
 * (bulk) the stored values are kept. The amount is always recomputed from
 * hours × rate (no rate → null), a visible write-off is 0 Kč.
 *  - APPROVE           → billable + approved (goes to the invoice basis)
 *  - REJECT            → rejected (drops out of the basis), status kept
 *  - HIDDEN_WRITE_OFF  → archived, off the invoice and the client timesheet
 *  - VISIBLE_WRITE_OFF → 0 Kč, on the client timesheet, off the invoice
 */
export function applyApprovalDecision(
  old: ApprovalDecisionSource,
  disposition: ApprovalDisposition,
  edits?: ApprovalDecisionEdits,
  now: Date = new Date(),
): ApprovalDecisionData {
  const hours = edits ? edits.hours : Number(old.hours.toString());
  const hourlyRate =
    edits && edits.hourlyRate !== undefined
      ? edits.hourlyRate
      : old.hourlyRate != null
        ? Number(old.hourlyRate.toString())
        : null;
  const description = edits ? edits.description : old.description;

  let billingStatus = old.billingStatus;
  let approvalStatus = old.approvalStatus;
  let amountCzk: number | null = hourlyRate != null ? hours * hourlyRate : null;
  let archivedAt = old.archivedAt;

  switch (disposition) {
    case "APPROVE":
      billingStatus = BillingStatus.BILLABLE;
      approvalStatus = ApprovalStatus.APPROVED;
      archivedAt = null;
      break;
    case "REJECT":
      approvalStatus = ApprovalStatus.REJECTED;
      break;
    case "HIDDEN_WRITE_OFF":
      billingStatus = BillingStatus.HIDDEN_WRITE_OFF;
      approvalStatus = ApprovalStatus.APPROVED;
      archivedAt = old.archivedAt ?? now;
      break;
    case "VISIBLE_WRITE_OFF":
      billingStatus = BillingStatus.VISIBLE_WRITE_OFF;
      approvalStatus = ApprovalStatus.APPROVED;
      amountCzk = 0;
      archivedAt = null;
      break;
  }

  return {
    hours,
    hourlyRate,
    amountCzk,
    description,
    ...(edits?.userId ? { userId: edits.userId } : {}),
    billingStatus,
    approvalStatus,
    archivedAt,
  };
}

type PluralForm = "one" | "few" | "many";

function pluralForm(count: number): PluralForm {
  const abs = Math.abs(count);
  if (abs === 1) {
    return "one";
  }
  const last = abs % 10;
  const lastTwo = abs % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
    ? "few"
    : "many";
}

/** Czech plural of "položka": 1 položka, 2–4 položky, 0 / 5+ položek. */
export function formatItemCount(count: number): string {
  const form = pluralForm(count);
  return `${count} ${form === "one" ? "položka" : form === "few" ? "položky" : "položek"}`;
}

/** Accusative ("Schválit 1 položku / 2 položky / 5 položek"). */
export function formatItemCountAccusative(count: number): string {
  const form = pluralForm(count);
  return `${count} ${form === "one" ? "položku" : form === "few" ? "položky" : "položek"}`;
}

const hoursTotalFormatter = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "7,50 h" — totals of the queue and of a selection. */
export function formatHoursTotal(hours: number): string {
  return `${hoursTotalFormatter.format(hours)} h`;
}

export type BulkDecisionState = {
  status: "idle" | "ok" | "error";
  message?: string;
  decided?: number;
  /** Timestamp of the result, so the same message re-announces. */
  at?: number;
};

export const STALE_SELECTION_MESSAGE =
  "Některé vybrané položky už nejsou ke schválení nebo k nim nemáte oprávnění. Obnovte stránku a vyberte znovu.";

export function bulkDecisionMessage(
  disposition: ApprovalDisposition,
  count: number,
): string {
  const form = pluralForm(count);
  const verb = disposition === "APPROVE" ? "Schválen" : "Zamítnut";
  const ending = form === "one" ? "a" : form === "few" ? "y" : "o";
  return `${verb}${ending} ${formatItemCount(count)}.`;
}
