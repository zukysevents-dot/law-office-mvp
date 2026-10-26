import { Copy } from "lucide-react";
import { notFound } from "next/navigation";

import {
  archiveWorkLog,
  restoreWorkLog,
  updateWorkLog,
} from "@/app/actions/work-logs";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { ArchiveNotice } from "@/components/archive-notice";
import { CascadingMatterSelect } from "@/components/cascading-matter-select";
import { Field, TextArea, TextInput } from "@/components/form-field";
import { WorkLogCategoryFields } from "@/components/work-log-category-fields";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { dateInputValue, numberInputValue } from "@/lib/form-values";
import {
  billingStatusLabels,
  internalTaskCategoryLabels,
  legalAreaOptions,
  options,
} from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { BillingStatus } from "@/generated/prisma/enums";
import {
  andWhere,
  canArchiveRecords,
  canEditRecord,
  canSetBillableStatus,
  canViewRates,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { AccessDenied } from "@/components/access-denied";
import { moduleAccessDenial } from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

type WorkLogEditProps = {
  params: Promise<{ id: string }>;
};

async function loadWorkLogEdit(id: string) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const [workLog, subjects, projects, cases, tasks, organization] = await Promise.all([
    prisma.workLog.findUnique({ where: { id } }),
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
    prisma.organization.findUnique({
      where: { id: currentUser.organizationId },
      select: { billingTimeIncrementMinutes: true },
    }),
  ]);

  return {
    workLog:
      workLog && canEditRecord(currentUser, "WorkLog", workLog)
        ? workLog
        : null,
    subjects,
    projects,
    cases,
    tasks,
    canArchive: canArchiveRecords(currentUser),
    canViewRates: canViewRates(currentUser),
    canSetBillable: canSetBillableStatus(currentUser),
    timeIncrementMinutes: organization?.billingTimeIncrementMinutes ?? 15,
  };
}

type WorkLogEditData = Awaited<ReturnType<typeof loadWorkLogEdit>>;

const emptyWorkLogEdit: WorkLogEditData = {
  workLog: null,
  subjects: [],
  projects: [],
  cases: [],
  tasks: [],
  canArchive: false,
  canViewRates: false,
  canSetBillable: false,
  timeIncrementMinutes: 15,
};

export default async function WorkLogEditPage({ params }: WorkLogEditProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.workLogs");
  if (accessDenied) {
    return <AccessDenied title="Výkazy práce" message={accessDenied} />;
  }

  const { id } = await params;
  const result = await safeQuery<WorkLogEditData>(
    emptyWorkLogEdit,
    () => loadWorkLogEdit(id),
  );

  if (result.databaseReady && !result.data.workLog) {
    notFound();
  }

  const {
    workLog,
    subjects,
    projects,
    cases,
    tasks,
    canArchive,
    canViewRates: showRates,
    canSetBillable,
    timeIncrementMinutes,
  } = result.data;
  const billingStatusChoices: BillingStatus[] = canSetBillable
    ? [
        BillingStatus.BILLABLE,
        BillingStatus.INTERNAL_NON_BILLABLE,
      ]
    : [BillingStatus.BILLABLE, BillingStatus.INTERNAL_NON_BILLABLE];
  // Keep the current status selectable even if the role couldn't normally set it
  // (e.g. a junior editing a partner-approved BILLABLE item).
  const currentBillingStatus = workLog?.billingStatus;
  const billingStatusOptions = (
    currentBillingStatus && !billingStatusChoices.includes(currentBillingStatus)
      ? [currentBillingStatus, ...billingStatusChoices]
      : billingStatusChoices
  ).map((status) => ({ value: status, label: billingStatusLabels[status] }));

  return (
    <>
      <PageHeader
        title="Upravit výkaz práce"
        description="Úprava evidence práce, sazby, částky a fakturačních statusů."
        action={
          <>
            {workLog ? (
              <ButtonLink
                href={`/work-logs?duplicate=${encodeURIComponent(workLog.id)}`}
                variant="secondary"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Duplikovat
              </ButtonLink>
            ) : null}
            {workLog ? (
              canArchive ? (
                <ArchiveActionForm
                  action={workLog.archivedAt ? restoreWorkLog : archiveWorkLog}
                  id={workLog.id}
                  mode={workLog.archivedAt ? "restore" : "archive"}
                />
              ) : null
            ) : null}
            <ButtonLink href="/work-logs" variant="secondary">
              Zpět na výkazy
            </ButtonLink>
          </>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <ArchiveNotice archivedAt={workLog?.archivedAt ?? null} />
      {workLog ? (
        <Section>
          <form action={updateWorkLog} className="grid gap-4">
            <input type="hidden" name="id" value={workLog.id} />
            {/* Stejná kaskáda jako u nového výkazu: subjekt → jeho projekty →
                jejich případy → úkoly; změna nadřazeného vynuluje nepasující. */}
            <CascadingMatterSelect
              subjects={subjects.map((subject) => ({
                id: subject.id,
                name: subject.ico
                  ? `${subject.name}, IČO ${subject.ico}`
                  : subject.name,
              }))}
              projects={projects}
              cases={cases.map((legalCase) => ({
                id: legalCase.id,
                name: legalCase.name,
                projectId: legalCase.projectId,
                projectName: legalCase.project.name,
              }))}
              tasks={tasks}
              includeTask
              subjectLabel="Subjekt"
              subjectPlaceholder="Bez subjektu"
              defaultSubjectId={workLog.subjectId ?? ""}
              defaultProjectId={workLog.projectId ?? ""}
              defaultCaseId={workLog.caseId ?? ""}
              defaultTaskId={workLog.taskId ?? ""}
              className="md:grid-cols-2"
            />
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Datum práce">
                <TextInput
                  name="workDate"
                  type="date"
                  defaultValue={dateInputValue(workLog.workDate)}
                  required
                />
              </Field>
              <Field label="Hodiny">
                <TextInput
                  name="hours"
                  type="number"
                  min="0"
                  step={timeIncrementMinutes === 6 ? 0.1 : 0.25}
                  defaultValue={numberInputValue(workLog.hours)}
                  required
                />
              </Field>
              {showRates ? (
                <Field label="Sazba">
                  <TextInput
                    name="hourlyRate"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={numberInputValue(workLog.hourlyRate)}
                  />
                </Field>
              ) : null}
            </div>
            <div className={showRates ? "grid gap-4" : "hidden"}>
              {showRates ? (
                <Field label="Částka">
                  <TextInput
                    name="amountCzk"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={numberInputValue(workLog.amountCzk)}
                  />
                </Field>
              ) : null}
            </div>
            {/* Interní hodiny nabízejí interní kategorie místo právní oblasti. */}
            <WorkLogCategoryFields
              billingStatusOptions={billingStatusOptions}
              defaultBillingStatus={workLog.billingStatus}
              legalAreas={legalAreaOptions}
              internalCategories={options.internalTaskCategories.map(
                (category) => ({
                  value: category,
                  label: internalTaskCategoryLabels[category],
                }),
              )}
              defaultLegalArea={workLog.legalArea ?? ""}
              defaultInternalCategory={workLog.internalCategory ?? ""}
            />
            <Field label="Popis">
              <TextArea name="description" defaultValue={workLog.description ?? ""} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" pendingLabel="Ukládám…">Uložit výkaz</Button>
              <ButtonLink href="/work-logs" variant="ghost">
                Zrušit
              </ButtonLink>
            </div>
          </form>
        </Section>
      ) : (
        <EmptyState>Editace výkazu není dostupná bez databáze.</EmptyState>
      )}
    </>
  );
}
