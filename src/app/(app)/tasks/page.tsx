import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  Clock3,
  Hourglass,
  Plus,
  Save,
} from "lucide-react";

import { createTask, updateTaskStatus } from "@/app/actions/tasks";
import { ColumnVisibilityPanel } from "@/components/column-visibility-panel";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TaskDeadlineType,
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma/enums";
import {
  archiveFilterLabels,
  archivedWhere,
  archiveFilterValue,
} from "@/lib/archive-filter";
import { getCurrentUser } from "@/lib/auth";
import { statusCount } from "@/lib/dashboard/task-counts";
import { safeQuery } from "@/lib/db-safe";
import { formatDate } from "@/lib/format";
import {
  options,
  taskDeadlineTypeLabels,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/lib/labels";
import {
  andWhere,
  canEditRecord,
  caseVisibilityWhere,
  projectVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  taskDeadlineTypeTone,
  taskStatusTone,
} from "@/lib/status-tones";
import { applyTaskLimit } from "@/lib/tasks/list-truncation";
import {
  getCurrentTableView,
  getDefaultTableView,
} from "@/lib/table-view-preference-service";
import type { TableViewState } from "@/lib/table-view-preferences";

export const dynamic = "force-dynamic";

type TasksProps = {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    assignedToId?: string;
    responsibleUserId?: string;
    projectId?: string;
    caseId?: string;
    deadlineType?: string;
    sort?: string;
    archive?: string;
  }>;
};

type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadlineType: TaskDeadlineType;
  startDate: Date | null;
  deadline: Date | null;
  sharepointUrl: string | null;
  archivedAt: Date | null;
  createdById: string | null;
  assignedToId: string | null;
  responsibleUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  project: { name: string; mainSubject: { name: string } } | null;
  case: {
    name: string;
    fileNumber: string | null;
    project: { mainSubject: { name: string } };
  } | null;
  createdBy: { name: string } | null;
  assignedTo: { name: string } | null;
  responsibleUser: { name: string } | null;
  canEdit: boolean;
};

type TasksPageData = {
  tasks: TaskRow[];
  truncated: boolean;
  users: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  cases: Array<{ id: string; name: string; project: { name: string } }>;
  cards: {
    review: number;
    waitingClient: number;
    waitingCounterparty: number;
    overdue: number;
  };
  tableView: TableViewState;
};

// Upper bound on rows pulled into a single list render. Filters keep normal
// usage well under this; the cap only guards against an unbounded scan when a
// firm accumulates thousands of tasks. When hit, the UI shows a notice.
const TASK_LIST_LIMIT = 500;

const sortLabels = {
  deadline: "Deadline",
  title: "Název",
  priority: "Priorita",
  status: "Status",
  assignedTo: "Řešitel",
  responsibleUser: "Odpovědná osoba",
};

function validEnum<T extends Record<string, string>>(source: T, value?: string) {
  return value && Object.values(source).includes(value) ? value : "";
}

function taskOrderBy(sort: string) {
  if (sort === "title") {
    return [{ title: "asc" as const }, { deadline: "asc" as const }];
  }

  if (sort === "priority") {
    return [{ priority: "desc" as const }, { deadline: "asc" as const }];
  }

  if (sort === "status") {
    return [{ status: "asc" as const }, { deadline: "asc" as const }];
  }

  if (sort === "assignedTo") {
    return [
      { assignedTo: { name: "asc" as const } },
      { deadline: "asc" as const },
    ];
  }

  if (sort === "responsibleUser") {
    return [
      { responsibleUser: { name: "asc" as const } },
      { deadline: "asc" as const },
    ];
  }

  return [
    { completedAt: "desc" as const },
    { deadline: "asc" as const },
    { createdAt: "desc" as const },
  ];
}

function taskSubjectName(task: TaskRow) {
  return (
    task.project?.mainSubject.name ??
    task.case?.project.mainSubject.name ??
    null
  );
}

export default async function TasksPage({ searchParams }: TasksProps) {
  const params = await searchParams;
  const status = validEnum(TaskStatus, params.status);
  const priority = validEnum(TaskPriority, params.priority);
  const deadlineType = validEnum(TaskDeadlineType, params.deadlineType);
  const assignedToId = params.assignedToId ?? "";
  const responsibleUserId = params.responsibleUserId ?? "";
  const projectId = params.projectId ?? "";
  const caseId = params.caseId ?? "";
  const sort = params.sort ?? "deadline";
  const archive = archiveFilterValue(params.archive);
  const now = new Date();

  const result = await safeQuery<TasksPageData>(
    {
      tasks: [],
      users: [],
      projects: [],
      cases: [],
      truncated: false,
      cards: { review: 0, waitingClient: 0, waitingCounterparty: 0, overdue: 0 },
      tableView: getDefaultTableView("tasks"),
    },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const tableView = await getCurrentTableView("tasks");
      const baseWhere = archivedWhere(archive);
      const taskAccessWhere = taskVisibilityWhere(currentUser);
      const activeWhere = andWhere({ archivedAt: null }, taskAccessWhere);
      const where = andWhere(
        baseWhere,
        taskAccessWhere,
        {
          ...(status ? { status: status as TaskStatus } : {}),
          ...(priority ? { priority: priority as TaskPriority } : {}),
          ...(deadlineType
            ? { deadlineType: deadlineType as TaskDeadlineType }
            : {}),
          ...(assignedToId ? { assignedToId } : {}),
          ...(responsibleUserId ? { responsibleUserId } : {}),
          ...(projectId ? { projectId } : {}),
          ...(caseId ? { caseId } : {}),
        },
      );

      const [tasks, users, projects, cases, statusGroups, overdue] =
        await Promise.all([
        prisma.task.findMany({
          where,
          orderBy: taskOrderBy(sort),
          // Fetch one extra row so we can tell "exactly LIMIT" from "more than
          // LIMIT" without a false-positive truncation notice.
          take: TASK_LIST_LIMIT + 1,
          // Explicit select (not include) so heavy free-text columns like
          // detailedDescription/shortDescription never travel to the list view.
          // organizationId is required by canEditRecord's org-isolation check.
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            deadlineType: true,
            startDate: true,
            deadline: true,
            sharepointUrl: true,
            archivedAt: true,
            organizationId: true,
            createdById: true,
            assignedToId: true,
            responsibleUserId: true,
            createdAt: true,
            updatedAt: true,
            project: {
              select: {
                name: true,
                mainSubject: { select: { name: true } },
              },
            },
            case: {
              select: {
                name: true,
                fileNumber: true,
                project: {
                  select: {
                    mainSubject: { select: { name: true } },
                  },
                },
              },
            },
            createdBy: { select: { name: true } },
            assignedTo: { select: { name: true } },
            responsibleUser: { select: { name: true } },
          },
        }),
        prisma.user.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.project.findMany({
          where: andWhere(
            { archivedAt: null },
            projectVisibilityWhere(currentUser),
          ),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.case.findMany({
          where: andWhere(
            { archivedAt: null },
            caseVisibilityWhere(currentUser),
          ),
          orderBy: { name: "asc" },
          select: { id: true, name: true, project: { select: { name: true } } },
        }),
        // One grouped scan covers the three status cards; overdue keeps its own
        // count because it filters on deadline rather than a single status.
        prisma.task.groupBy({
          by: ["status"],
          where: activeWhere,
          _count: { _all: true },
        }),
        prisma.task.count({
          where: {
            ...activeWhere,
            status: { not: TaskStatus.COMPLETED },
            deadline: { lt: now },
          },
        }),
      ]);

      const { visible: visibleTasks, truncated } = applyTaskLimit(
        tasks,
        TASK_LIST_LIMIT,
      );

      return {
        tasks: visibleTasks.map((task) => ({
          ...task,
          canEdit: canEditRecord(currentUser, "Task", task),
        })),
        truncated,
        users,
        projects,
        cases,
        cards: {
          review: statusCount(statusGroups, TaskStatus.FOR_REVIEW),
          waitingClient: statusCount(statusGroups, TaskStatus.WAITING_FOR_CLIENT),
          waitingCounterparty: statusCount(
            statusGroups,
            TaskStatus.WAITING_FOR_COUNTERPARTY,
          ),
          overdue,
        },
        tableView,
      };
    },
  );
  const visibleColumnSet = new Set(result.data.tableView.visibleColumns);

  return (
    <>
      <PageHeader
        title="Úkoly"
        action={
          <>
            <ButtonLink href="/tasks/my" variant="secondary">
              Moje úkoly
            </ButtonLink>
            <ButtonLink href="/tasks/archive" variant="secondary">
              Archiv úkolů
            </ButtonLink>
            <ButtonLink href="#new-task">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nový úkol
            </ButtonLink>
          </>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ke kontrole" value={result.data.cards.review} icon={ClipboardCheck} />
        <StatCard
          label="Čeká na klienta"
          value={result.data.cards.waitingClient}
          icon={Hourglass}
        />
        <StatCard
          label="Čeká na protistranu"
          value={result.data.cards.waitingCounterparty}
          icon={Clock3}
        />
        <StatCard
          label="Po termínu"
          value={result.data.cards.overdue}
          icon={AlertTriangle}
          tone="danger"
        />
      </div>
      <Section>
        <form className="grid gap-3 lg:grid-cols-4 xl:grid-cols-5">
          <Field label="Status">
            <SelectInput name="status" defaultValue={status}>
              <option value="">Všechny statusy</option>
              {options.taskStatuses.map((taskStatus) => (
                <option key={taskStatus} value={taskStatus}>
                  {taskStatusLabels[taskStatus]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Priorita">
            <SelectInput name="priority" defaultValue={priority}>
              <option value="">Všechny priority</option>
              {options.taskPriorities.map((item) => (
                <option key={item} value={item}>
                  {taskPriorityLabels[item]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Řešitel">
            <SelectInput name="assignedToId" defaultValue={assignedToId}>
              <option value="">Všichni řešitelé</option>
              {result.data.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Odpovědná osoba">
            <SelectInput name="responsibleUserId" defaultValue={responsibleUserId}>
              <option value="">Všechny osoby</option>
              {result.data.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
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
          <Field label="Typ lhůty">
            <SelectInput name="deadlineType" defaultValue={deadlineType}>
              <option value="">Všechny lhůty</option>
              {options.taskDeadlineTypes.map((type) => (
                <option key={type} value={type}>
                  {taskDeadlineTypeLabels[type]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Řazení">
            <SelectInput name="sort" defaultValue={sort}>
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
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
          <Button type="submit" variant="secondary" className="self-end">
            Filtrovat
          </Button>
        </form>
      </Section>
      <Section title="Seznam úkolů">
        <ColumnVisibilityPanel
          tableKey="tasks"
          columns={result.data.tableView.columns}
          visibleColumns={result.data.tableView.visibleColumns}
        />
        {result.data.truncated ? (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Zobrazeno prvních {TASK_LIST_LIMIT} úkolů. Pro zobrazení dalších
            zpřesněte filtr výše.
          </p>
        ) : null}
        {result.data.tasks.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full [&_td]:align-top">
              <thead>
                <tr>
                  {result.data.tableView.columns
                    .filter((column) => visibleColumnSet.has(column.id))
                    .map((column) => (
                      <th key={column.id}>{column.label}</th>
                    ))}
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {result.data.tasks.map((task) => (
                  <tr key={task.id}>
                    {visibleColumnSet.has("title") ? (
                      <td className="max-w-xs">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="font-medium text-emerald-950 hover:underline"
                        >
                          {task.title}
                        </Link>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("subject") ? (
                      <td>{taskSubjectName(task) ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("project") ? (
                      <td>{task.project?.name ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("case") ? (
                      <td>
                        {task.case
                          ? `${task.case.name}${
                              task.case.fileNumber
                                ? `, ${task.case.fileNumber}`
                                : ""
                            }`
                          : "—"}
                      </td>
                    ) : null}
                    {visibleColumnSet.has("createdBy") ? (
                      <td>{task.createdBy?.name ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("assignee") ? (
                      <td>{task.assignedTo?.name ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("responsiblePerson") ? (
                      <td>{task.responsibleUser?.name ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("status") ? (
                      <td className="min-w-80">
                        {task.canEdit ? (
                          <form action={updateTaskStatus} className="grid min-w-0 gap-2">
                            <input type="hidden" name="taskId" value={task.id} />
                            <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
                              <SelectInput
                                name="status"
                                defaultValue={task.status}
                                className="min-w-0"
                              >
                                {options.taskStatuses.map((taskStatus) => (
                                  <option key={taskStatus} value={taskStatus}>
                                    {taskStatusLabels[taskStatus]}
                                  </option>
                                ))}
                              </SelectInput>
                              <Button
                                type="submit"
                                variant="secondary"
                                className="h-10 px-3"
                              >
                                <Save className="h-4 w-4" aria-hidden="true" />
                                <span className="sr-only">Uložit status</span>
                              </Button>
                            </div>
                            <TextInput
                              name="note"
                              placeholder="Komentář ke změně statusu"
                              className="min-w-0"
                            />
                          </form>
                        ) : null}
                        <Badge
                          tone={taskStatusTone(task.status)}
                          className={task.canEdit ? "mt-2" : undefined}
                        >
                          {taskStatusLabels[task.status]}
                        </Badge>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("priority") ? (
                      <td>{taskPriorityLabels[task.priority]}</td>
                    ) : null}
                    {visibleColumnSet.has("deadlineType") ? (
                      <td>
                        <Badge tone={taskDeadlineTypeTone(task.deadlineType)}>
                          {taskDeadlineTypeLabels[task.deadlineType]}
                        </Badge>
                      </td>
                    ) : null}
                    {visibleColumnSet.has("startDate") ? (
                      <td>{formatDate(task.startDate)}</td>
                    ) : null}
                    {visibleColumnSet.has("deadline") ? (
                      <td>{formatDate(task.deadline)}</td>
                    ) : null}
                    {visibleColumnSet.has("sharePointUrl") ? (
                      <td className="max-w-xs truncate">
                        {task.sharepointUrl ?? "—"}
                      </td>
                    ) : null}
                    {visibleColumnSet.has("createdAt") ? (
                      <td>{formatDate(task.createdAt)}</td>
                    ) : null}
                    {visibleColumnSet.has("updatedAt") ? (
                      <td>{formatDate(task.updatedAt)}</td>
                    ) : null}
                    <td>
                      <ButtonLink
                        href={`/tasks/${task.id}`}
                        variant="ghost"
                        className="h-8 px-3"
                      >
                        Detail
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Žádné úkoly neodpovídají filtrům.</EmptyState>
        )}
      </Section>
      <Section title="Nový úkol" id="new-task" className="scroll-mt-6">
        <form action={createTask} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Název úkolu" className="md:col-span-2">
              <TextInput name="title" required />
            </Field>
            <Field label="Priorita">
              <SelectInput name="priority" defaultValue="STANDARD">
                {options.taskPriorities.map((priorityItem) => (
                  <option key={priorityItem} value={priorityItem}>
                    {taskPriorityLabels[priorityItem]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Řešitel">
              <SelectInput name="assignedToId">
                <option value="">Bez přiřazení</option>
                {result.data.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Odpovědná osoba">
              <SelectInput name="responsibleUserId">
                <option value="">Bez přiřazení</option>
                {result.data.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Projekt">
              <SelectInput name="projectId">
                <option value="">Bez projektu</option>
                {result.data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Případ">
              <SelectInput name="caseId">
                <option value="">Bez případu</option>
                {result.data.cases.map((legalCase) => (
                  <option key={legalCase.id} value={legalCase.id}>
                    {legalCase.name} / {legalCase.project.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Typ lhůty">
              <SelectInput name="deadlineType" defaultValue="INTERNAL">
                {options.taskDeadlineTypes.map((type) => (
                  <option key={type} value={type}>
                    {taskDeadlineTypeLabels[type]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Začátek">
              <TextInput name="startDate" type="date" />
            </Field>
            <Field label="Deadline">
              <TextInput name="deadline" type="date" />
            </Field>
          </div>
          <Field label="Krátký popis">
            <TextInput name="shortDescription" />
          </Field>
          <Field label="Detailní popis">
            <TextArea name="detailedDescription" />
          </Field>
          <Field label="SharePoint URL">
            <TextInput name="sharepointUrl" type="url" />
          </Field>
          <div>
            <Button type="submit">Vytvořit úkol</Button>
          </div>
        </form>
      </Section>
    </>
  );
}
