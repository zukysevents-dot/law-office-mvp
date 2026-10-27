import Link from "next/link";
import { Copy } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { CascadingMatterSelect } from "@/components/cascading-matter-select";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDate, formatDateUtc } from "@/lib/format";
import { taskStatusLabels } from "@/lib/labels";
import { moduleAccessDenial } from "@/lib/module-access.server";
import { getOrgUserFilterOptions } from "@/lib/org-users";
import {
  andWhere,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { countLabel } from "@/lib/plural";
import { getPrisma } from "@/lib/prisma";
import {
  filterFormKey,
  filterQuery,
  type SearchParamValue,
} from "@/lib/search-params";
import { taskStatusTone } from "@/lib/status-tones";
import {
  TASK_ARCHIVE_DATE_FIELDS,
  archiveMonthOptions,
  archiveRangeSummary,
  hasActiveArchiveFilters,
  monthLabel,
  parseTaskArchiveFilters,
  resolveTaskArchiveRange,
  taskArchiveDateFieldLabels,
  taskArchiveWhere,
  type ArchiveMonthOption,
  type TaskArchiveFilters,
} from "@/lib/tasks/archive-filters";
import { applyTaskLimit } from "@/lib/tasks/list-truncation";
import {
  formatAssigneeNames,
  taskPeopleFromRecord,
  taskPeopleSelect,
} from "@/lib/tasks/task-people";

export const dynamic = "force-dynamic";

// Horní mez karet na jedno vykreslení (každá nese i historii stavů).
const ARCHIVE_LIMIT = 200;

const TASK_FORMS = ["úkol", "úkoly", "úkolů"] as const;

type TaskArchiveProps = {
  searchParams: Promise<Record<string, SearchParamValue>>;
};

type ArchivedTask = {
  id: string;
  title: string;
  completedAt: Date | null;
  archivedAt: Date | null;
  deadline: Date | null;
  subjectName: string | null;
  project: { name: string } | null;
  case: { name: string; fileNumber: string | null } | null;
  createdBy: { name: string } | null;
  assigneeNames: string;
  supervisorNames: string;
  statusHistory: Array<{
    id: string;
    oldStatus: keyof typeof taskStatusLabels;
    newStatus: keyof typeof taskStatusLabels;
    note: string | null;
    createdAt: Date;
    changedBy: { name: string } | null;
  }>;
};

type TaskArchiveData = {
  tasks: ArchivedTask[];
  total: number;
  truncated: boolean;
  months: ArchiveMonthOption[];
  subjects: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; mainSubjectId: string }>;
  cases: Array<{ id: string; name: string; projectId: string; projectName: string }>;
  people: Array<{ id: string; name: string; active: boolean }>;
};

const emptyData: TaskArchiveData = {
  tasks: [],
  total: 0,
  truncated: false,
  months: [],
  subjects: [],
  projects: [],
  cases: [],
  people: [],
};

const ARCHIVED_SUFFIX = " (archiv)";

function archiveHref(filters: TaskArchiveFilters, overrides: Partial<TaskArchiveFilters>) {
  const next = { ...filters, ...overrides };
  const query = filterQuery({
    subjectId: next.subjectId,
    projectId: next.projectId,
    caseId: next.caseId,
    createdById: next.createdById,
    assigneeId: next.assigneeId,
    supervisorId: next.supervisorId,
    q: next.q,
    dateField: next.dateField === "closed" ? "" : next.dateField,
    period: next.period,
    dateFrom: next.dateFrom,
    dateTo: next.dateTo,
  });
  return query ? `/tasks/archive?${query}` : "/tasks/archive";
}

// Archiv úkolů s filtry (subjekt, projekt, případ, zadavatel, řešitel, dohled,
// název, období nad zvoleným datem). Filtry jsou v URL a kombinují se;
// viditelnost hlídá taskVisibilityWhere.
export default async function TaskArchivePage({ searchParams }: TaskArchiveProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.tasks");
  if (accessDenied) {
    return <AccessDenied title="Archiv úkolů" message={accessDenied} />;
  }

  const params = await searchParams;
  const filters = parseTaskArchiveFilters(params);
  const now = new Date();
  const range = resolveTaskArchiveRange(filters, now);
  const active = hasActiveArchiveFilters(filters);

  const result = await safeQuery<TaskArchiveData>(emptyData, async () => {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();
    const visibility = taskVisibilityWhere(currentUser);
    const where = andWhere(taskArchiveWhere(filters, now), visibility);

    const [tasks, total, oldest, subjects, projects, cases, people] =
      await Promise.all([
        prisma.task.findMany({
          where,
          orderBy: [
            { completedAt: { sort: "desc", nulls: "last" } },
            { archivedAt: "desc" },
            { id: "asc" },
          ],
          take: ARCHIVE_LIMIT + 1,
          select: {
            id: true,
            title: true,
            completedAt: true,
            archivedAt: true,
            deadline: true,
            project: {
              select: { name: true, mainSubject: { select: { name: true } } },
            },
            case: {
              select: {
                name: true,
                fileNumber: true,
                project: { select: { mainSubject: { select: { name: true } } } },
              },
            },
            createdBy: { select: { name: true } },
            ...taskPeopleSelect,
            statusHistory: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                oldStatus: true,
                newStatus: true,
                note: true,
                createdAt: true,
                changedBy: { select: { name: true } },
              },
            },
          },
        }),
        prisma.task.count({ where }),
        prisma.task.aggregate({
          where: andWhere({ archivedAt: { not: null } }, visibility),
          _min: { archivedAt: true },
        }),
        // Filtr nabízí i archivované subjekty / projekty / případy (archiv
        // úkolů je historie), vždy jen viditelné.
        prisma.subject.findMany({
          where: subjectVisibilityWhere(currentUser),
          orderBy: { name: "asc" },
          select: { id: true, name: true, archivedAt: true },
        }),
        prisma.project.findMany({
          where: projectVisibilityWhere(currentUser),
          orderBy: { name: "asc" },
          select: { id: true, name: true, mainSubjectId: true, archivedAt: true },
        }),
        prisma.case.findMany({
          where: caseVisibilityWhere(currentUser),
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            projectId: true,
            archivedAt: true,
            project: { select: { name: true } },
          },
        }),
        getOrgUserFilterOptions(currentUser),
      ]);

    const { visible, truncated } = applyTaskLimit(tasks, ARCHIVE_LIMIT);
    const suffix = (archivedAt: Date | null) => (archivedAt ? ARCHIVED_SUFFIX : "");

    return {
      tasks: visible.map((task) => {
        const taskPeople = taskPeopleFromRecord(task);
        return {
          id: task.id,
          title: task.title,
          completedAt: task.completedAt,
          archivedAt: task.archivedAt,
          deadline: task.deadline,
          subjectName:
            task.project?.mainSubject.name ?? task.case?.project.mainSubject.name ?? null,
          project: task.project ? { name: task.project.name } : null,
          case: task.case
            ? { name: task.case.name, fileNumber: task.case.fileNumber }
            : null,
          createdBy: task.createdBy,
          assigneeNames: formatAssigneeNames(taskPeople.assignees),
          supervisorNames: taskPeople.supervisors.map((person) => person.name).join(", "),
          statusHistory: task.statusHistory,
        };
      }),
      total,
      truncated,
      months: archiveMonthOptions(oldest._min.archivedAt, now),
      subjects: subjects.map((subject) => ({
        id: subject.id,
        name: `${subject.name}${suffix(subject.archivedAt)}`,
      })),
      projects: projects.map((project) => ({
        id: project.id,
        name: `${project.name}${suffix(project.archivedAt)}`,
        mainSubjectId: project.mainSubjectId,
      })),
      cases: cases.map((legalCase) => ({
        id: legalCase.id,
        name: `${legalCase.name}${suffix(legalCase.archivedAt)}`,
        projectId: legalCase.projectId,
        projectName: legalCase.project.name,
      })),
      people,
    };
  });

  const data = result.data;
  // Zvolený měsíc mimo nabídku (starší než 60 měsíců / před prvním archivem)
  // se do výběru doplní, aby formulář ukazoval skutečný filtr.
  const months = [...data.months];
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(filters.period);
  if (monthMatch && !months.some((month) => month.value === filters.period)) {
    months.push({
      value: filters.period,
      label: monthLabel(Number(monthMatch[1]), Number(monthMatch[2])),
    });
  }
  const summaryRange = archiveRangeSummary(filters.dateField, range);
  const personOption = (person: { id: string; name: string; active: boolean }) => (
    <option key={person.id} value={person.id}>
      {person.name}
      {person.active ? "" : " (neaktivní)"}
    </option>
  );

  return (
    <>
      <PageHeader
        title="Archiv úkolů"
        description="Dokončené a archivované úkoly včetně historie workflow stavů."
        action={
          <ButtonLink href="/tasks" variant="secondary">
            Zpět na aktivní úkoly
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <Section title="Filtry">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[#566673]">Rychle:</span>
          <ButtonLink
            href={archiveHref(filters, { period: "this-month", dateFrom: "", dateTo: "" })}
            variant="ghost"
            className="h-8 px-3"
          >
            Tento měsíc
          </ButtonLink>
          <ButtonLink
            href={archiveHref(filters, { period: "last-month", dateFrom: "", dateTo: "" })}
            variant="ghost"
            className="h-8 px-3"
          >
            Minulý měsíc
          </ButtonLink>
        </div>
        <form
          key={filterFormKey(params)}
          className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <CascadingMatterSelect
            subjects={data.subjects}
            projects={data.projects}
            cases={data.cases}
            defaultSubjectId={filters.subjectId}
            defaultProjectId={filters.projectId}
            defaultCaseId={filters.caseId}
            subjectLabel="Subjekt"
            subjectPlaceholder="Všechny subjekty"
            filterMode
          />
          <Field label="Zadavatel">
            <SelectInput name="createdById" defaultValue={filters.createdById}>
              <option value="">Všichni zadavatelé</option>
              {data.people.map(personOption)}
            </SelectInput>
          </Field>
          <Field label="Řešitel">
            <SelectInput name="assigneeId" defaultValue={filters.assigneeId}>
              <option value="">Všichni řešitelé</option>
              {data.people.map(personOption)}
            </SelectInput>
          </Field>
          <Field label="Dohled">
            <SelectInput name="supervisorId" defaultValue={filters.supervisorId}>
              <option value="">Bez filtru dohledu</option>
              {data.people.map(personOption)}
            </SelectInput>
          </Field>
          <Field label="Název obsahuje">
            <TextInput name="q" type="search" defaultValue={filters.q} />
          </Field>
          <Field label="Datum, podle kterého filtrovat">
            <SelectInput name="dateField" defaultValue={filters.dateField}>
              {TASK_ARCHIVE_DATE_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {taskArchiveDateFieldLabels[field]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Období">
            <SelectInput name="period" defaultValue={filters.period}>
              <option value="">Kdykoli</option>
              <option value="this-month">Tento měsíc</option>
              <option value="last-month">Minulý měsíc</option>
              <optgroup label="Konkrétní měsíc">
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </optgroup>
              <option value="custom">Vlastní rozsah (od–do)</option>
            </SelectInput>
          </Field>
          <Field label="Od">
            <TextInput name="dateFrom" type="date" defaultValue={filters.dateFrom} />
          </Field>
          <Field label="Do">
            <TextInput name="dateTo" type="date" defaultValue={filters.dateTo} />
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            <Button type="submit" variant="secondary">
              Filtrovat
            </Button>
            {active ? (
              <ButtonLink href="/tasks/archive" variant="ghost">
                Zrušit filtry
              </ButtonLink>
            ) : null}
          </div>
        </form>
        <p className="mt-3 text-xs text-[#566673]">
          Vyplněné Od / Do mají přednost před zvoleným obdobím. Datum dokončení /
          archivace = kdy byl úkol dokončen (ručně archivované úkoly podle data
          archivace).
        </p>
      </Section>
      <Section title="Archivované úkoly">
        {result.databaseReady && (active || data.total > 0) ? (
          <p className="mb-3 text-sm text-[#2c3a45]" data-testid="archive-summary">
            Nalezeno {countLabel(data.total, TASK_FORMS)}
            {summaryRange ? ` · ${summaryRange}` : ""}
          </p>
        ) : null}
        {data.truncated ? (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Zobrazeno prvních {ARCHIVE_LIMIT} úkolů. Zpřesněte filtr.
          </p>
        ) : null}
        {data.tasks.length > 0 ? (
          <div className="grid gap-4">
            {data.tasks.map((task) => (
              <article
                key={task.id}
                className="rounded-md border border-stone-200 bg-stone-50 p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[1fr_14rem]">
                  <div className="min-w-0">
                    <h2 className="break-words text-base font-semibold text-stone-950">
                      <Link href={`/tasks/${task.id}`} className="hover:underline">
                        {task.title}
                      </Link>
                    </h2>
                    <div className="mt-2 grid gap-2 text-sm text-stone-700 md:grid-cols-3">
                      <p>
                        <span className="font-medium text-stone-950">Subjekt:</span>{" "}
                        {task.subjectName ?? "—"}
                      </p>
                      <p>
                        <span className="font-medium text-stone-950">Projekt:</span>{" "}
                        {task.project?.name ?? "—"}
                      </p>
                      <p>
                        <span className="font-medium text-stone-950">Případ:</span>{" "}
                        {task.case
                          ? `${task.case.name}${
                              task.case.fileNumber ? `, ${task.case.fileNumber}` : ""
                            }`
                          : "—"}
                      </p>
                      <p>
                        <span className="font-medium text-stone-950">Zadavatel:</span>{" "}
                        {task.createdBy?.name ?? "—"}
                      </p>
                      <p>
                        <span className="font-medium text-stone-950">Řešitelé:</span>{" "}
                        {task.assigneeNames || "—"}
                      </p>
                      <p>
                        <span className="font-medium text-stone-950">Dohled:</span>{" "}
                        {task.supervisorNames || "—"}
                      </p>
                      <p>
                        <span className="font-medium text-stone-950">Termín:</span>{" "}
                        {formatDateUtc(task.deadline)}
                      </p>
                    </div>
                  </div>
                  <div className="grid content-start gap-2 lg:justify-items-end lg:text-right">
                    <div>
                      <p className="text-xs font-semibold uppercase text-stone-500">
                        {task.completedAt ? "Dokončeno" : "Archivováno"}
                      </p>
                      <p className="font-medium text-stone-950">
                        {formatDate(task.completedAt ?? task.archivedAt)}
                      </p>
                    </div>
                    <ButtonLink
                      href={`/tasks/new?duplicate=${task.id}`}
                      variant="ghost"
                      className="h-8 px-3"
                      aria-label={`Duplikovat úkol ${task.title}`}
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Duplikovat
                    </ButtonLink>
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-stone-950">
                    Historie stavů
                  </h3>
                  {task.statusHistory.length > 0 ? (
                    <div className="mt-2 table-scroll">
                      <table className="w-max min-w-full table-auto">
                        <thead>
                          <tr>
                            <th>Datum</th>
                            <th>Změna</th>
                            <th>Změnil</th>
                            <th>Poznámka</th>
                          </tr>
                        </thead>
                        <tbody>
                          {task.statusHistory.map((history) => (
                            <tr key={history.id}>
                              <td>{formatDate(history.createdAt)}</td>
                              <td>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge tone={taskStatusTone(history.oldStatus)}>
                                    {taskStatusLabels[history.oldStatus]}
                                  </Badge>
                                  <span>→</span>
                                  <Badge tone={taskStatusTone(history.newStatus)}>
                                    {taskStatusLabels[history.newStatus]}
                                  </Badge>
                                </div>
                              </td>
                              <td>{history.changedBy?.name ?? "—"}</td>
                              <td>{history.note ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState>Úkol zatím nemá historii stavů.</EmptyState>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : active ? (
          <EmptyState>Žádné archivované úkoly neodpovídají filtrům.</EmptyState>
        ) : (
          <EmptyState>Archiv úkolů je zatím prázdný.</EmptyState>
        )}
      </Section>
    </>
  );
}
