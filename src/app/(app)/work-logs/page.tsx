import { ClipboardCheck, Copy, FileText, Plus } from "lucide-react";

import { archiveWorkLog, restoreWorkLog } from "@/app/actions/work-logs";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { CascadingMatterSelect } from "@/components/cascading-matter-select";
import { ColumnVisibilityPanel } from "@/components/column-visibility-panel";
import { WorkLogCreateDialog } from "@/components/work-log-create-dialog";
import { WorkLogCreateForm } from "@/components/work-log-create-form";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  archiveFilterLabels,
  archivedWhere,
  archiveFilterValue,
} from "@/lib/archive-filter";
import { getCurrentUser } from "@/lib/auth";
import { approvalFilterQuery } from "@/lib/billing-approvals";
import {
  countApprovalQueue,
  getApprovalAccess,
} from "@/lib/billing-approvals.server";
import { isModuleEnabled } from "@/lib/entitlements";
import { safeQuery } from "@/lib/db-safe";
import {
  formatCaseLabel,
  formatDate,
  formatDateUtc,
  formatHours,
  formatMoney,
} from "@/lib/format";
import { DAY_MS, fulfillmentPercent, weekStartUtcMs } from "@/lib/hours-plan";
import { getOrgUserOptions } from "@/lib/org-users";
import { filterFormKey, firstParam } from "@/lib/search-params";
import {
  approvalStatusLabels,
  billingStatusLabels,
  internalTaskCategoryLabels,
  legalAreaOptions,
  options,
} from "@/lib/labels";
import { getPrisma } from "@/lib/prisma";
import { billingStatusTone } from "@/lib/status-tones";
import {
  getCurrentTableView,
  getDefaultTableView,
  restrictTableView,
} from "@/lib/table-view-preference-service";
import type { TableViewState } from "@/lib/table-view-preferences";
import { BillingStatus, ModuleKey } from "@/generated/prisma/enums";
import {
  buildWorkLogDuplicatePrefill,
  type WorkLogDuplicatePrefill,
} from "@/lib/work-logs/duplicate";
import {
  emptyWorkLogFormOptions,
  loadWorkLogFormOptions,
  type WorkLogFormOptions,
} from "@/lib/work-logs/create-form.server";
import {
  andWhere,
  billingApproverWorkLogWhere,
  canArchiveRecords,
  canEditRecord,
  canSetBillableStatus,
  canViewRates,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { AccessDenied } from "@/components/access-denied";
import { moduleAccessDenial } from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

type WorkLogsProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type WorkLogsPageData = {
  workLogs: Array<{
    id: string;
    userId: string | null;
    workDate: Date;
    hours: unknown;
    hourlyRate: unknown;
    amountCzk: unknown;
    description: string | null;
    billingStatus: keyof typeof billingStatusLabels;
    approvalStatus: keyof typeof approvalStatusLabels;
    legalArea: string | null;
    internalCategory: keyof typeof internalTaskCategoryLabels | null;
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
    subject: { name: string } | null;
    project: { name: string } | null;
    case: { name: string; fileNumber: string | null } | null;
    task: { title: string } | null;
    user: { name: string } | null;
    canEdit: boolean;
  }>;
  subjects: Array<{ id: string; name: string; ico: string | null }>;
  projects: Array<{ id: string; name: string; mainSubjectId: string }>;
  cases: Array<{
    id: string;
    name: string;
    projectId: string;
    project: { name: string };
  }>;
  tasks: Array<{
    id: string;
    title: string;
    projectId: string | null;
    caseId: string | null;
    mine: boolean;
  }>;
  users: Array<{ id: string; name: string }>;
  tableView: TableViewState;
  canArchive: boolean;
  canViewRates: boolean;
  canSetBillable: boolean;
  canApprove: boolean;
  /** null = no link (not an approver or the billing module is off). */
  approvalQueueCount: number | null;
  /** undefined = no ?duplicate, null = source not found / not visible. */
  duplicatePrefill: WorkLogDuplicatePrefill | null | undefined;
  formOptions: WorkLogFormOptions;
  // Souhrn hodin přihlášeného uživatele (jeho vlastní výkazy).
  monthSummary: {
    billable: number;
    needsApproval: number;
    internal: number;
    total: number;
  };
  weekHours: number;
  // Cíle z plánu hodin (null = nenastaveno) pro „% plnění".
  weeklyTarget: number | null;
  monthlyTarget: number | null;
};

function numberParam(value: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

// Query params that only open the create/duplicate dialog — they must not remount
// (and so reset) the filter form.
const WORK_LOG_DIALOG_PARAMS = ["new", "duplicate", "hours"] as const;

export default async function WorkLogsPage({ searchParams }: WorkLogsProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.workLogs");
  if (accessDenied) {
    return <AccessDenied title="Výkazy práce" message={accessDenied} />;
  }

  const params = await searchParams;
  const subjectId = firstParam(params, "subjectId");
  const projectId = firstParam(params, "projectId");
  const caseId = firstParam(params, "caseId");
  const taskId = firstParam(params, "taskId");
  const userId = firstParam(params, "userId");
  const billingStatus = firstParam(params, "billingStatus");
  const approvalStatus = firstParam(params, "approvalStatus");
  const legalArea = firstParam(params, "legalArea");
  const archive = archiveFilterValue(firstParam(params, "archive"));
  const dateFrom = firstParam(params, "dateFrom");
  const dateTo = firstParam(params, "dateTo");
  const minAmount = numberParam(firstParam(params, "minAmount"));
  const maxAmount = numberParam(firstParam(params, "maxAmount"));
  // The floating timer stops into this form with ?hours=<elapsed> so the most
  // repeated daily action needs zero manual time math.
  const hoursPrefill = firstParam(params, "hours");
  // "Duplikovat" opens the same dialog prefilled from an existing work log.
  const duplicateId = firstParam(params, "duplicate");
  const showNewDialog =
    firstParam(params, "new") === "1" ||
    Boolean(hoursPrefill) ||
    Boolean(duplicateId);

  const result = await safeQuery<WorkLogsPageData>(
    {
      workLogs: [],
      subjects: [],
      projects: [],
      cases: [],
      tasks: [],
      users: [],
      tableView: getDefaultTableView("workLogs"),
      canArchive: false,
      canViewRates: false,
      canSetBillable: false,
      canApprove: false,
      approvalQueueCount: null,
      duplicatePrefill: undefined,
      formOptions: emptyWorkLogFormOptions,
      monthSummary: { billable: 0, needsApproval: 0, internal: 0, total: 0 },
      weekHours: 0,
      weeklyTarget: null,
      monthlyTarget: null,
    },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const tableView = await getCurrentTableView("workLogs");
      const approvalAccess = await getApprovalAccess(prisma, currentUser);
      const { canApproveAll, canApprove } = approvalAccess;
      const visibleWorkLogsWhere = canApproveAll
        ? workLogVisibilityWhere(currentUser)
        : canApprove
          ? andWhere(
              { organizationId: currentUser.organizationId },
              {
                OR: [
                  workLogVisibilityWhere(currentUser),
                  billingApproverWorkLogWhere(currentUser.id),
                ],
              },
            )
          : workLogVisibilityWhere(currentUser);
      // Hranice pro souhrn: aktuální měsíc a aktuální týden (od pondělí).
      // Týden přes sdílený weekStartUtcMs helper, aby karta „Tento týden" a
      // týdenní graf na dashboardu počítaly vždy stejný interval (workDate je
      // uložený na UTC půlnoc, takže UTC hranice je pro výběr správná).
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const weekStartMs = weekStartUtcMs(now);
      const weekStart = new Date(weekStartMs);
      const nextWeekStart = new Date(weekStartMs + 7 * DAY_MS);
      const [
        workLogs,
        formOptions,
        users,
        monthGroups,
        weekAgg,
        hoursPlan,
        approvalQueueCount,
        duplicateSource,
      ] = await Promise.all([
        prisma.workLog.findMany({
          where: andWhere(
            archivedWhere(archive),
            visibleWorkLogsWhere,
            {
              ...(subjectId ? { subjectId } : {}),
              ...(projectId ? { projectId } : {}),
              ...(caseId ? { caseId } : {}),
              ...(taskId ? { taskId } : {}),
              ...(userId ? { userId } : {}),
              ...(billingStatus ? { billingStatus: billingStatus as never } : {}),
              ...(approvalStatus ? { approvalStatus: approvalStatus as never } : {}),
              ...(legalArea ? { legalArea } : {}),
              ...(dateFrom || dateTo
                ? {
                    workDate: {
                      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
                      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
                    },
                  }
                : {}),
              ...(minAmount !== null || maxAmount !== null
                ? {
                    amountCzk: {
                      ...(minAmount !== null ? { gte: minAmount } : {}),
                      ...(maxAmount !== null ? { lte: maxAmount } : {}),
                    },
                  }
                : {}),
            },
          ),
          orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
          take: 100,
          // Explicit select avoids pulling unused WorkLog columns; organizationId
          // is required by canEditRecord's org-isolation check.
          select: {
            id: true,
            organizationId: true,
            userId: true,
            workDate: true,
            hours: true,
            hourlyRate: true,
            amountCzk: true,
            description: true,
            billingStatus: true,
            approvalStatus: true,
            legalArea: true,
            internalCategory: true,
            createdAt: true,
            updatedAt: true,
            archivedAt: true,
            subject: { select: { name: true } },
            project: { select: { name: true } },
            case: { select: { name: true, fileNumber: true } },
            task: { select: { title: true } },
            user: { select: { name: true } },
          },
        }),
        loadWorkLogFormOptions(prisma, currentUser),
        getOrgUserOptions(currentUser),
        prisma.workLog.groupBy({
          by: ["billingStatus", "approvalStatus"],
          where: {
            userId: currentUser.id,
            archivedAt: null,
            workDate: { gte: monthStart, lt: nextMonthStart },
          },
          _sum: { hours: true },
        }),
        prisma.workLog.aggregate({
          where: {
            userId: currentUser.id,
            archivedAt: null,
            workDate: { gte: weekStart, lt: nextWeekStart },
          },
          _sum: { hours: true },
        }),
        prisma.userHoursPlan.findUnique({
          where: { userId: currentUser.id },
          select: { weeklyHoursTarget: true, monthlyHoursTarget: true },
        }),
        canApprove &&
        (await isModuleEnabled(currentUser.organizationId, ModuleKey.BILLING))
          ? countApprovalQueue(prisma, currentUser, approvalAccess)
          : null,
        // Source of "Duplikovat" — same scope as the list (org + visibility /
        // approver scope), so an unknown or foreign ID simply isn't found.
        duplicateId
          ? prisma.workLog.findFirst({
              where: andWhere({ id: duplicateId }, visibleWorkLogsWhere),
              select: {
                subjectId: true,
                projectId: true,
                caseId: true,
                taskId: true,
                hours: true,
                hourlyRate: true,
                billingStatus: true,
                legalArea: true,
                internalCategory: true,
                description: true,
                workDate: true,
              },
            })
          : null,
      ]);

      const sumGroups = (predicate: (group: (typeof monthGroups)[number]) => boolean) =>
        monthGroups
          .filter(predicate)
          .reduce((acc, group) => acc + Number(group._sum.hours ?? 0), 0);
      const billable = sumGroups(
        (group) =>
          group.billingStatus === BillingStatus.BILLABLE &&
          group.approvalStatus === "APPROVED",
      );
      const needsApproval = monthGroups
        .filter(
          (group) =>
            group.billingStatus === BillingStatus.BILLABLE &&
            group.approvalStatus !== "APPROVED" &&
            group.approvalStatus !== "REJECTED",
        )
        .reduce((acc, group) => acc + Number(group._sum.hours ?? 0), 0);
      const total = sumGroups(() => true);
      const internal = total - billable - needsApproval;
      const monthSummary = {
        billable,
        needsApproval,
        internal,
        total,
      };
      const weekHours = Number(weekAgg._sum.hours ?? 0);
      const { subjects, projects, cases, tasks } = formOptions;
      // Only matters the user can still pick (visible + not archived) are
      // prefilled; the copy is validated again by createWorkLog.
      const duplicatePrefill = duplicateId
        ? duplicateSource
          ? buildWorkLogDuplicatePrefill(
              duplicateSource,
              {
                subjectIds: new Set(subjects.map((subject) => subject.id)),
                projectIds: new Set(projects.map((project) => project.id)),
                caseIds: new Set(cases.map((legalCase) => legalCase.id)),
                tasks: new Map(
                  tasks.map((task) => [
                    task.id,
                    { projectId: task.projectId, caseId: task.caseId },
                  ]),
                ),
              },
              canViewRates(currentUser),
            )
          : null
        : undefined;

      return {
        workLogs: workLogs.map((workLog) => ({
          ...workLog,
          canEdit: canEditRecord(currentUser, "WorkLog", workLog),
        })),
        formOptions,
        subjects,
        projects,
        cases,
        tasks,
        users,
        tableView,
        canArchive: canArchiveRecords(currentUser),
        canViewRates: canViewRates(currentUser),
        canSetBillable: canSetBillableStatus(currentUser),
        canApprove,
        approvalQueueCount,
        duplicatePrefill,
        monthSummary,
        weekHours,
        weeklyTarget:
          hoursPlan?.weeklyHoursTarget != null
            ? Number(hoursPlan.weeklyHoursTarget)
            : null,
        monthlyTarget:
          hoursPlan?.monthlyHoursTarget != null
            ? Number(hoursPlan.monthlyHoursTarget)
            : null,
      };
    },
  );
  // Hide rate + amount for roles that may not see pricing.
  let tableView = result.data.canViewRates
    ? result.data.tableView
    : restrictTableView(result.data.tableView, ["hourlyRate", "amount"]);
  if (!result.data.canApprove) {
    tableView = restrictTableView(tableView, ["approvalStatus"]);
  }
  const visibleColumnSet = new Set(tableView.visibleColumns);
  // % plnění týdenního a měsíčního plánu hodin (null = plán nenastaven).
  const weekPct = fulfillmentPercent(
    result.data.weekHours,
    result.data.weeklyTarget,
  );
  const monthPct = fulfillmentPercent(
    result.data.monthSummary.total,
    result.data.monthlyTarget,
  );

  // Carry the active matter/date filters into the client timesheet (print) view.
  const timesheetParams = new URLSearchParams(
    Object.entries({ subjectId, projectId, caseId, dateFrom, dateTo }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
  const timesheetHref = timesheetParams
    ? `/work-logs/timesheet?${timesheetParams}`
    : "/work-logs/timesheet";
  const closeDialogParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (
      key === "new" ||
      key === "hours" ||
      key === "duplicate" ||
      value === undefined
    ) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      closeDialogParams.append(key, item);
    }
  }
  const closeDialogQuery = closeDialogParams.toString();
  // "Duplikovat" keeps the current filters, so closing the dialog returns to
  // the same filtered list.
  const duplicateHref = (id: string) => {
    const query = new URLSearchParams(closeDialogParams);
    query.set("duplicate", id);
    return `/work-logs?${query.toString()}`;
  };
  const duplicatePrefill = result.data.duplicatePrefill;
  const isDuplicate = Boolean(duplicatePrefill);
  const approvalQuery = approvalFilterQuery({
    subjectId,
    projectId,
    caseId,
    userId,
    dateFrom,
    dateTo,
  });
  const closeDialogHref = closeDialogQuery
    ? `/work-logs?${closeDialogQuery}`
    : "/work-logs";
  const hasFilters = Boolean(
    subjectId ||
      projectId ||
      caseId ||
      taskId ||
      userId ||
      billingStatus ||
      approvalStatus ||
      legalArea ||
      archive !== "active" ||
      dateFrom ||
      dateTo ||
      minAmount !== null ||
      maxAmount !== null,
  );

  return (
    <>
      <PageHeader
        title="Výkazy práce"
        description={
          result.data.canViewRates
            ? "Evidence vykázané práce se sazbou a částkou jako příprava pro budoucí fakturaci."
            : "Evidence vykázané práce a odpracovaného času."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {result.data.approvalQueueCount !== null ? (
              <ButtonLink
                href={
                  approvalQuery
                    ? `/work-logs/approvals?${approvalQuery}`
                    : "/work-logs/approvals"
                }
                variant="secondary"
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                Ke schválení ({result.data.approvalQueueCount})
              </ButtonLink>
            ) : null}
            <ButtonLink href={timesheetHref} variant="secondary">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Výkaz pro klienta
            </ButtonLink>
            <ButtonLink href="/work-logs?new=1">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nový výkaz
            </ButtonLink>
          </div>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section title="Můj přehled hodin">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            {
              label: "Tento týden",
              value: result.data.weekHours,
              target: result.data.weeklyTarget,
              pct: weekPct,
            },
            {
              label: "Tento měsíc celkem",
              value: result.data.monthSummary.total,
              target: result.data.monthlyTarget,
              pct: monthPct,
            },
            {
              label: "Fakturovatelné (měsíc)",
              value: result.data.monthSummary.billable,
              target: null,
              pct: null,
            },
            {
              label: "Ke schválení (měsíc)",
              value: result.data.monthSummary.needsApproval,
              target: null,
              pct: null,
            },
            {
              label: "Interní / odpis (měsíc)",
              value: result.data.monthSummary.internal,
              target: null,
              pct: null,
            },
          ].map((cell) => (
            <div
              key={cell.label}
              className="rounded-lg border border-[#dce4e8] bg-white p-4 shadow-sm shadow-[#0e1822]/5"
            >
              <p className="text-sm font-medium text-[#566673]">{cell.label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#0e1822]">
                {formatHours(cell.value)}
              </p>
              {cell.target != null ? (
                <p className="mt-1 text-xs text-[#566673]">
                  z {formatHours(cell.target)} h plánu
                  {cell.pct != null ? ` · ${cell.pct} % plnění` : ""}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Filtry">
        <form
          key={filterFormKey(params, WORK_LOG_DIALOG_PARAMS)}
          className="grid gap-4"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <CascadingMatterSelect
              subjects={result.data.subjects.map((subject) => ({
                id: subject.id,
                name: subject.ico
                  ? `${subject.name}, IČO ${subject.ico}`
                  : subject.name,
              }))}
              projects={result.data.projects}
              cases={result.data.cases.map((legalCase) => ({
                id: legalCase.id,
                name: legalCase.name,
                projectId: legalCase.projectId,
                projectName: legalCase.project.name,
              }))}
              tasks={result.data.tasks}
              includeTask
              defaultSubjectId={subjectId}
              defaultProjectId={projectId}
              defaultCaseId={caseId}
              defaultTaskId={taskId}
              subjectLabel="Subjekt"
              filterMode
            />
            <Field label="Pracovník">
              <SelectInput name="userId" defaultValue={userId}>
                <option value="">Všichni pracovníci</option>
                {result.data.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Billing status">
              <SelectInput name="billingStatus" defaultValue={billingStatus}>
                <option value="">Vše</option>
                {options.billingStatuses
                  .filter((status) => status !== BillingStatus.NEEDS_APPROVAL)
                  .map((status) => (
                  <option key={status} value={status}>
                    {billingStatusLabels[status]}
                  </option>
                  ))}
              </SelectInput>
            </Field>
            {result.data.canApprove ? <Field label="Approval status">
              <SelectInput name="approvalStatus" defaultValue={approvalStatus}>
                <option value="">Vše</option>
                {options.approvalStatuses.map((status) => (
                  <option key={status} value={status}>
                    {approvalStatusLabels[status]}
                  </option>
                ))}
              </SelectInput>
            </Field> : null}
            <Field label="Právní oblast">
              <SelectInput name="legalArea" defaultValue={legalArea}>
                <option value="">Všechny oblasti</option>
                {legalAreaOptions.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Archiv">
              <SelectInput name="archive" defaultValue={archive}>
                {Object.entries(archiveFilterLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Datum od">
              <TextInput name="dateFrom" type="date" defaultValue={dateFrom} />
            </Field>
            <Field label="Datum do">
              <TextInput name="dateTo" type="date" defaultValue={dateTo} />
            </Field>
            <Field label="Min. částka">
              <TextInput name="minAmount" defaultValue={firstParam(params, "minAmount")} />
            </Field>
            <Field label="Max. částka">
              <TextInput name="maxAmount" defaultValue={firstParam(params, "maxAmount")} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary">
              Filtrovat
            </Button>
            {hasFilters ? (
              <ButtonLink href="/work-logs" variant="ghost">
                Zrušit filtry
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </Section>
      <Section title="Seznam výkazů práce">
        <ColumnVisibilityPanel
          tableKey="workLogs"
          columns={tableView.columns}
          visibleColumns={tableView.visibleColumns}
        />
        {result.data.workLogs.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  {tableView.columns
                    .filter((column) => visibleColumnSet.has(column.id))
                    .map((column) => (
                      <th key={column.id}>{column.label}</th>
                    ))}
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {result.data.workLogs.map((log) => (
                  <tr key={log.id}>
                    {visibleColumnSet.has("date") ? (
                      <td>{formatDateUtc(log.workDate)}</td>
                    ) : null}
                    {visibleColumnSet.has("subject") ? (
                      <td>{log.subject?.name ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("project") ? (
                      <td>{log.project?.name ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("case") ? (
                      <td>{formatCaseLabel(log.case)}</td>
                    ) : null}
                    {visibleColumnSet.has("task") ? (
                      <td className="max-w-xs">{log.task?.title ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("worker") ? (
                      <td>{log.user?.name ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("hours") ? (
                      <td>{formatHours(log.hours as never)}</td>
                    ) : null}
                    {visibleColumnSet.has("hourlyRate") ? (
                      <td>{formatMoney(log.hourlyRate as never)}</td>
                    ) : null}
                    {visibleColumnSet.has("amount") ? (
                      <td>{formatMoney(log.amountCzk as never)}</td>
                    ) : null}
                    {visibleColumnSet.has("description") ? (
                      <td className="min-w-48 max-w-md whitespace-pre-line break-words">
                        {log.description ?? "—"}
                      </td>
                    ) : null}
                    {visibleColumnSet.has("legalArea") ? (
                      <td>
                        {log.legalArea ??
                          (log.internalCategory
                            ? internalTaskCategoryLabels[log.internalCategory]
                            : "—")}
                      </td>
                    ) : null}
                    {visibleColumnSet.has("billingStatus") ? (
                      <td>
                        <Badge tone={billingStatusTone(log.billingStatus)}>
                          {billingStatusLabels[log.billingStatus]}
                        </Badge>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("approvalStatus") ? (
                      <td>
                        <Badge tone="blue">
                          {approvalStatusLabels[log.approvalStatus]}
                        </Badge>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("createdAt") ? (
                      <td>{formatDate(log.createdAt)}</td>
                    ) : null}
                    {visibleColumnSet.has("updatedAt") ? (
                      <td>{formatDate(log.updatedAt)}</td>
                    ) : null}
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {log.canEdit ? (
                          <ButtonLink
                            href={`/work-logs/${log.id}/edit`}
                            variant="ghost"
                            className="h-8 px-3"
                          >
                            Upravit
                          </ButtonLink>
                        ) : null}
                        <ButtonLink
                          href={duplicateHref(log.id)}
                          variant="ghost"
                          className="h-8 px-3"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Duplikovat
                        </ButtonLink>
                        {result.data.canArchive ? (
                          <ArchiveActionForm
                            action={log.archivedAt ? restoreWorkLog : archiveWorkLog}
                            id={log.id}
                            mode={log.archivedAt ? "restore" : "archive"}
                            buttonClassName="h-8 px-3"
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Zatím nejsou založené žádné výkazy práce.</EmptyState>
        )}
      </Section>
      <WorkLogCreateDialog
        open={showNewDialog}
        closeHref={closeDialogHref}
        title={isDuplicate ? "Duplikovat výkaz práce" : "Nový výkaz práce"}
        description={
          duplicatePrefill
            ? `Kopie výkazu z ${formatDateUtc(duplicatePrefill.sourceDate)}. Upravte datum a popis a uložte jako nový výkaz.`
            : duplicatePrefill === null
              ? "Výkaz pro duplikaci nebyl nalezen nebo k němu nemáte přístup."
              : undefined
        }
      >
        <WorkLogCreateForm
          formKey={duplicateId || "new"}
          options={result.data.formOptions}
          sourceWorkLogId={duplicatePrefill ? duplicateId : undefined}
          prefill={
            duplicatePrefill ?? (hoursPrefill ? { hours: hoursPrefill } : null)
          }
          submitLabel={isDuplicate ? "Vytvořit kopii výkazu" : "Vytvořit výkaz"}
        />
      </WorkLogCreateDialog>
    </>
  );
}
