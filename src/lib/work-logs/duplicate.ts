// "Duplikovat výkaz" — builds the prefill of the create dialog from an existing
// work log. Pure (unit-tested): the page loads the source through the same
// visibility scope as the list and passes the matter IDs the user may still
// pick (visible + not archived). The copy is a NEW record created by the normal
// createWorkLog action, so nothing here carries the work date, the approval
// status, the invoice linkage or the author — those come from the defaults of
// a new work log (today, SUBMITTED/DRAFT, not invoiced, the current user).

export type WorkLogDuplicateSource = {
  subjectId: string | null;
  projectId: string | null;
  caseId: string | null;
  taskId: string | null;
  hours: { toString(): string } | number | string;
  hourlyRate: { toString(): string } | number | string | null;
  billingStatus: string;
  legalArea: string | null;
  internalCategory: string | null;
  description: string | null;
  workDate: Date;
};

export type WorkLogDuplicateAllowed = {
  subjectIds: ReadonlySet<string>;
  projectIds: ReadonlySet<string>;
  caseIds: ReadonlySet<string>;
  /** Visible, not archived tasks with their matter (to drop orphaned tasks). */
  tasks: ReadonlyMap<string, { projectId: string | null; caseId: string | null }>;
};

export type WorkLogDuplicatePrefill = {
  subjectId: string;
  projectId: string;
  caseId: string;
  taskId: string;
  hours: string;
  hourlyRate: string;
  billingStatus: "BILLABLE" | "INTERNAL_NON_BILLABLE";
  legalArea: string;
  internalCategory: string;
  description: string;
  /** Work date of the original, for the dialog's explanatory text only. */
  sourceDate: Date;
};

function numberString(value: WorkLogDuplicateSource["hours"] | null): string {
  if (value === null || value === undefined) {
    return "";
  }
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? String(parsed) : "";
}

export function buildWorkLogDuplicatePrefill(
  source: WorkLogDuplicateSource,
  allowed: WorkLogDuplicateAllowed,
  canViewRates: boolean,
): WorkLogDuplicatePrefill {
  // A matter level the user can no longer pick (archived / not visible) is not
  // prefilled, and neither is anything below it.
  const projectId =
    source.projectId && allowed.projectIds.has(source.projectId)
      ? source.projectId
      : "";
  const projectDropped = Boolean(source.projectId) && !projectId;
  const caseId =
    !projectDropped && source.caseId && allowed.caseIds.has(source.caseId)
      ? source.caseId
      : "";
  const caseDropped = Boolean(source.caseId) && !caseId;
  const task = source.taskId ? allowed.tasks.get(source.taskId) : undefined;
  const taskOrphaned =
    !task ||
    (projectDropped && Boolean(task.projectId || task.caseId)) ||
    (caseDropped && Boolean(task.caseId));
  const taskId = source.taskId && !taskOrphaned ? source.taskId : "";
  const subjectId =
    source.subjectId && allowed.subjectIds.has(source.subjectId)
      ? source.subjectId
      : "";

  // Write-offs and the legacy NEEDS_APPROVAL value are approver decisions —
  // a copy starts as ordinary billable work (internal stays internal).
  const billingStatus =
    source.billingStatus === "INTERNAL_NON_BILLABLE"
      ? "INTERNAL_NON_BILLABLE"
      : "BILLABLE";

  return {
    subjectId,
    projectId,
    caseId,
    taskId,
    hours: numberString(source.hours),
    hourlyRate: canViewRates ? numberString(source.hourlyRate) : "",
    billingStatus,
    legalArea: billingStatus === "BILLABLE" ? source.legalArea ?? "" : "",
    internalCategory:
      billingStatus === "INTERNAL_NON_BILLABLE"
        ? source.internalCategory ?? ""
        : "",
    description: source.description ?? "",
    sourceDate: source.workDate,
  };
}

const pragueDateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date as `YYYY-MM-DD` in the office's time zone (Europe/Prague). */
export function todayDateInputValue(now: Date = new Date()): string {
  return pragueDateFormat.format(now);
}
