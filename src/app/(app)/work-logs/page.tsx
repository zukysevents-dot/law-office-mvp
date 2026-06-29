import { Plus, WandSparkles } from "lucide-react";

import {
  archiveWorkLog,
  createWorkLog,
  restoreWorkLog,
} from "@/app/actions/work-logs";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { CascadingMatterSelect } from "@/components/cascading-matter-select";
import { ColumnVisibilityPanel } from "@/components/column-visibility-panel";
import { WorkLogCategoryFields } from "@/components/work-log-category-fields";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
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
import { safeQuery } from "@/lib/db-safe";
import {
  formatCaseLabel,
  formatDate,
  formatDateUtc,
  formatHours,
  formatMoney,
} from "@/lib/format";
import { firstParam } from "@/lib/search-params";
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
import { BillingStatus } from "@/generated/prisma/enums";
import {
  andWhere,
  canViewAllLegalData,
  canEditRecord,
  canSetBillableStatus,
  canViewRates,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";

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
  }>;
  users: Array<{ id: string; name: string }>;
  tableView: TableViewState;
  canArchive: boolean;
  canViewRates: boolean;
  canSetBillable: boolean;
};

function numberParam(value: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export default async function WorkLogsPage({ searchParams }: WorkLogsProps) {
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
    },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const tableView = await getCurrentTableView("workLogs");
      const [workLogs, subjects, projects, cases, tasks, users] = await Promise.all([
        prisma.workLog.findMany({
          where: andWhere(
            archivedWhere(archive),
            workLogVisibilityWhere(currentUser),
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
        prisma.subject.findMany({
          where: andWhere(
            { archivedAt: null },
            subjectVisibilityWhere(currentUser),
          ),
          orderBy: { name: "asc" },
          select: { id: true, name: true, ico: true },
        }),
        prisma.project.findMany({
          where: andWhere(
            { archivedAt: null },
            projectVisibilityWhere(currentUser),
          ),
          orderBy: { name: "asc" },
          select: { id: true, name: true, mainSubjectId: true },
        }),
        prisma.case.findMany({
          where: andWhere(
            { archivedAt: null },
            caseVisibilityWhere(currentUser),
          ),
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            projectId: true,
            project: { select: { name: true } },
          },
        }),
        prisma.task.findMany({
          where: andWhere(
            { archivedAt: null },
            taskVisibilityWhere(currentUser),
          ),
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, projectId: true, caseId: true },
        }),
        prisma.user.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);

      return {
        workLogs: workLogs.map((workLog) => ({
          ...workLog,
          canEdit: canEditRecord(currentUser, "WorkLog", workLog),
        })),
        subjects,
        projects,
        cases,
        tasks,
        users,
        tableView,
        canArchive: canViewAllLegalData(currentUser),
        canViewRates: canViewRates(currentUser),
        canSetBillable: canSetBillableStatus(currentUser),
      };
    },
  );
  // Hide rate + amount for roles that may not see pricing.
  const tableView = result.data.canViewRates
    ? result.data.tableView
    : restrictTableView(result.data.tableView, ["hourlyRate", "amount"]);
  const visibleColumnSet = new Set(tableView.visibleColumns);
  // Junior roles file work only as "ke schválení" / "interní". Odpisové statusy
  // (skrytý/viditelný odpis) se nastavují jen ve schvalování, ne tady.
  const billingStatusChoices = result.data.canSetBillable
    ? [
        BillingStatus.BILLABLE,
        BillingStatus.NEEDS_APPROVAL,
        BillingStatus.INTERNAL_NON_BILLABLE,
      ]
    : [BillingStatus.NEEDS_APPROVAL, BillingStatus.INTERNAL_NON_BILLABLE];
  const defaultBillingStatus = result.data.canSetBillable
    ? BillingStatus.BILLABLE
    : BillingStatus.NEEDS_APPROVAL;

  return (
    <>
      <PageHeader
        title="Výkazy práce"
        description="Evidence vykázané práce se sazbou a částkou jako příprava pro budoucí fakturaci."
        action={
          <ButtonLink href="#new-work-log">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nový výkaz
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <Section title="Filtry">
        <form className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Subjekt">
              <SelectInput name="subjectId" defaultValue={subjectId}>
                <option value="">Všechny subjekty</option>
                {result.data.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                    {subject.ico ? `, IČO ${subject.ico}` : ""}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Projekt">
              <SelectInput name="projectId" defaultValue={projectId}>
                <option value="">Všechny projekty</option>
                {result.data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Případ">
              <SelectInput name="caseId" defaultValue={caseId}>
                <option value="">Všechny případy</option>
                {result.data.cases.map((legalCase) => (
                  <option key={legalCase.id} value={legalCase.id}>
                    {legalCase.name} / {legalCase.project.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Úkol">
              <SelectInput name="taskId" defaultValue={taskId}>
                <option value="">Všechny úkoly</option>
                {result.data.tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </SelectInput>
            </Field>
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
                {options.billingStatuses.map((status) => (
                  <option key={status} value={status}>
                    {billingStatusLabels[status]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Approval status">
              <SelectInput name="approvalStatus" defaultValue={approvalStatus}>
                <option value="">Vše</option>
                {options.approvalStatuses.map((status) => (
                  <option key={status} value={status}>
                    {approvalStatusLabels[status]}
                  </option>
                ))}
              </SelectInput>
            </Field>
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
          <div>
            <Button type="submit" variant="secondary">
              Filtrovat
            </Button>
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
                      <td className="max-w-md">{log.description ?? "—"}</td>
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
      <Section title="Nový výkaz práce" id="new-work-log" className="scroll-mt-6">
        <form action={createWorkLog} className="grid gap-4">
          {/* Cascading subject → project → case → task. Choosing a project/case
              narrows the task list to only that matter's tasks. */}
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
            subjectLabel="Subjekt"
          />
          <div
            className={
              result.data.canViewRates
                ? "grid gap-4 md:grid-cols-4"
                : "grid gap-4 md:grid-cols-3"
            }
          >
            <Field label="Datum práce">
              <TextInput name="workDate" type="date" required />
            </Field>
            <Field label="Hodiny">
              <TextInput name="hours" type="number" min="0" step="0.25" required />
            </Field>
            {/* Rate is hidden during reporting for non-partners — it is derived
                from the case/project and they shouldn't see (or set) pricing. */}
            {result.data.canViewRates ? (
              <Field label="Sazba">
                <TextInput name="hourlyRate" type="number" min="0" step="0.01" />
              </Field>
            ) : null}
            <Field label="Approval status">
              <SelectInput name="approvalStatus" defaultValue="DRAFT">
                {options.approvalStatuses.map((status) => (
                  <option key={status} value={status}>
                    {approvalStatusLabels[status]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          {/* Interní hodiny nabízejí interní kategorie místo právní oblasti. */}
          <WorkLogCategoryFields
            billingStatusOptions={billingStatusChoices.map((status) => ({
              value: status,
              label: billingStatusLabels[status],
            }))}
            defaultBillingStatus={defaultBillingStatus}
            legalAreas={legalAreaOptions}
            internalCategories={options.internalTaskCategories.map((category) => ({
              value: category,
              label: internalTaskCategoryLabels[category],
            }))}
          />
          <Field label="Popis práce">
            <TextArea name="description" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Vytvořit výkaz</Button>
            <Button type="button" variant="secondary" disabled>
              <WandSparkles className="h-4 w-4" aria-hidden="true" />
              Vylepšit text
            </Button>
          </div>
        </form>
      </Section>
    </>
  );
}
