import { notFound } from "next/navigation";

import {
  archiveWorkLog,
  restoreWorkLog,
  updateWorkLog,
} from "@/app/actions/work-logs";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { ArchiveNotice } from "@/components/archive-notice";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { dateInputValue, numberInputValue } from "@/lib/form-values";
import {
  approvalStatusLabels,
  billingStatusLabels,
  legalAreaOptions,
  options,
} from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type WorkLogEditProps = {
  params: Promise<{ id: string }>;
};

async function loadWorkLogEdit(id: string) {
  const prisma = getPrisma();
  const [workLog, subjects, projects, cases, tasks] = await Promise.all([
    prisma.workLog.findUnique({ where: { id } }),
    prisma.subject.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, ico: true },
    }),
    prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.case.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, project: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);

  return { workLog, subjects, projects, cases, tasks };
}

type WorkLogEditData = Awaited<ReturnType<typeof loadWorkLogEdit>>;

const emptyWorkLogEdit: WorkLogEditData = {
  workLog: null,
  subjects: [],
  projects: [],
  cases: [],
  tasks: [],
};

export default async function WorkLogEditPage({ params }: WorkLogEditProps) {
  const { id } = await params;
  const result = await safeQuery<WorkLogEditData>(
    emptyWorkLogEdit,
    () => loadWorkLogEdit(id),
  );

  if (result.databaseReady && !result.data.workLog) {
    notFound();
  }

  const { workLog, subjects, projects, cases, tasks } = result.data;

  return (
    <>
      <PageHeader
        title="Upravit výkaz práce"
        description="Úprava evidence práce, sazby, částky a fakturačních statusů."
        action={
          <>
            {workLog ? (
              <ArchiveActionForm
                action={workLog.archivedAt ? restoreWorkLog : archiveWorkLog}
                id={workLog.id}
                mode={workLog.archivedAt ? "restore" : "archive"}
              />
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
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Subjekt">
                <SelectInput name="subjectId" defaultValue={workLog.subjectId ?? ""}>
                  <option value="">Bez subjektu</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                      {subject.ico ? `, IČO ${subject.ico}` : ""}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Projekt">
                <SelectInput name="projectId" defaultValue={workLog.projectId ?? ""}>
                  <option value="">Bez projektu</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Případ">
                <SelectInput name="caseId" defaultValue={workLog.caseId ?? ""}>
                  <option value="">Bez případu</option>
                  {cases.map((legalCase) => (
                    <option key={legalCase.id} value={legalCase.id}>
                      {legalCase.name} / {legalCase.project.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Úkol">
                <SelectInput name="taskId" defaultValue={workLog.taskId ?? ""}>
                  <option value="">Bez úkolu</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
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
                  step="0.25"
                  defaultValue={numberInputValue(workLog.hours)}
                  required
                />
              </Field>
              <Field label="Sazba">
                <TextInput
                  name="hourlyRate"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={numberInputValue(workLog.hourlyRate)}
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Částka">
                <TextInput
                  name="amountCzk"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={numberInputValue(workLog.amountCzk)}
                />
              </Field>
              <Field label="Billing status">
                <SelectInput
                  name="billingStatus"
                  defaultValue={workLog.billingStatus}
                >
                  {options.billingStatuses.map((status) => (
                    <option key={status} value={status}>
                      {billingStatusLabels[status]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Approval status">
                <SelectInput
                  name="approvalStatus"
                  defaultValue={workLog.approvalStatus}
                >
                  {options.approvalStatuses.map((status) => (
                    <option key={status} value={status}>
                      {approvalStatusLabels[status]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Field label="Právní oblast">
              <SelectInput name="legalArea" defaultValue={workLog.legalArea ?? ""}>
                <option value="">Vyberte oblast</option>
                {legalAreaOptions.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Popis">
              <TextArea name="description" defaultValue={workLog.description ?? ""} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Uložit výkaz</Button>
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
