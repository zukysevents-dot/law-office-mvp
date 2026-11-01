import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  Clock3,
  Hourglass,
  Plus,
  Save,
} from "lucide-react";

import { updateTaskStatus } from "@/app/actions/tasks";
import { CascadingMatterSelect } from "@/components/cascading-matter-select";
import { ColumnVisibilityPanel } from "@/components/column-visibility-panel";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { RowClickNav } from "@/components/row-click-nav";
import { Section } from "@/components/section";
import { StatCard } from "@/components/stat-card";
import { TaskCreateForm } from "@/components/task-create-form";
import { TaskStatusLegend } from "@/components/task-status-legend";
import { TaskWorkLogDialog } from "@/components/task-work-log-dialog";
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
import { summarizeLabels } from "@/lib/assignments";
import { getCurrentUser } from "@/lib/auth";
import { statusCount } from "@/lib/dashboard/task-counts";
import { safeQuery } from "@/lib/db-safe";
import { formatDate, formatDateUtc } from "@/lib/format";
import {
  options,
  taskDeadlineTypeLabels,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/lib/labels";
import { canAccessModule } from "@/lib/module-access.server";
import {
  andWhere,
  canWorkOnTask,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { filterFormKey, hrefWithout } from "@/lib/search-params";
import {
  emptyTaskFormOptions,
  loadTaskFormOptions,
  type TaskFormOptions,
} from "@/lib/tasks/task-form-options.server";
import {
  isTaskOverdue,
  taskDeadlineTypeTone,
  taskStatusRowClass,
  taskStatusTone,
} from "@/lib/status-tones";
import { applyTaskLimit } from "@/lib/tasks/list-truncation";
import {
  taskAssigneeWhere,
  taskPeopleFromRecord,
  taskPeopleSelect,
  taskSupervisorWhere,
  type TaskPeopleView,
} from "@/lib/tasks/task-people";
import {
  getCurrentTableView,
  getDefaultTableView,
} from "@/lib/table-view-preference-service";
import type { TableViewState } from "@/lib/table-view-preferences";
import { AccessDenied } from "@/components/access-denied";
import { moduleAccessDenial } from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

type TasksProps = {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    assignedToId?: string;
    supervisorId?: string;
    createdById?: string;
    responsibleUserId?: string;
    subjectId?: string;
    projectId?: string;
    caseId?: string;
    deadlineType?: string;
    overdue?: string;
    sort?: string;
    archive?: string;
    logWork?: string;
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
  responsibleUser: { name: string } | null;
  people: TaskPeopleView;
  canWork: boolean;
  /** Počet odložení termínu (štítek „odloženo N×“). */
  postponeCount: number;
};

type TasksPageData = {
  tasks: TaskRow[];
  truncated: boolean;
  formOptions: TaskFormOptions;
  canLogWork: boolean;
  cards: {
    review: number;
    waitingClient: number;
    waitingCounterparty: number;
    overdue: number;
  };
  tableView: TableViewState;
  currentUserId: string;
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
  assignedTo: "Hlavní řešitel",
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

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function validId(value?: string) {
  return value && ID_PATTERN.test(value) ? value : "";
}

function PeopleCell({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <>—</>;
  }
  const { shown, rest } = summarizeLabels(names);
  return (
    <span title={names.join(", ")}>
      {shown.join(", ")}
      {rest > 0 ? ` +${rest}` : ""}
    </span>
  );
}

function taskSubjectName(task: TaskRow) {
  return (
    task.project?.mainSubject.name ??
    task.case?.project.mainSubject.name ??
    null
  );
}

export default async function TasksPage({ searchParams }: TasksProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.tasks");
  if (accessDenied) {
    return <AccessDenied title="Úkoly" message={accessDenied} />;
  }

  const params = await searchParams;
  const status = validEnum(TaskStatus, params.status);
  const priority = validEnum(TaskPriority, params.priority);
  const deadlineType = validEnum(TaskDeadlineType, params.deadlineType);
  const assignedToId = validId(params.assignedToId);
  const supervisorId = validId(params.supervisorId);
  const createdById = validId(params.createdById);
  const logWorkTaskId = validId(params.logWork);
  const responsibleUserId = params.responsibleUserId ?? "";
  const subjectId = params.subjectId ?? "";
  const projectId = params.projectId ?? "";
  const caseId = params.caseId ?? "";
  const overdueOnly = params.overdue === "1" || params.overdue === "true";
  const sort = params.sort ?? "deadline";
  const archive = archiveFilterValue(params.archive);
  const now = new Date();

  const result = await safeQuery<TasksPageData>(
    {
      tasks: [],
      formOptions: emptyTaskFormOptions,
      canLogWork: false,
      truncated: false,
      cards: { review: 0, waitingClient: 0, waitingCounterparty: 0, overdue: 0 },
      tableView: getDefaultTableView("tasks"),
      currentUserId: "",
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
          ...(responsibleUserId ? { responsibleUserId } : {}),
          ...(createdById ? { createdById } : {}),
          ...(projectId ? { projectId } : {}),
          ...(caseId ? { caseId } : {}),
          // "Po termínu" card links here: overdue = past deadline and not yet
          // done. Don't clobber an explicit status filter if one is also set.
          ...(overdueOnly
            ? {
                deadline: { lt: now },
                ...(status ? {} : { status: { not: TaskStatus.COMPLETED } }),
              }
            : {}),
        },
        // Filtr „Řešitel“ = libovolný řešitel (hlavní i další). URL parametr
        // zůstává assignedToId kvůli starším odkazům.
        assignedToId ? taskAssigneeWhere(assignedToId) : {},
        supervisorId ? taskSupervisorWhere(supervisorId) : {},
        // Client filter: task hangs under a project (direct) or a case (whose
        // project carries the client). Match either path.
        subjectId
          ? {
              OR: [
                { project: { mainSubjectId: subjectId } },
                { case: { project: { mainSubjectId: subjectId } } },
              ],
            }
          : {},
      );

      const [
        tasks,
        formOptions,
        canLogWork,
        statusGroups,
        overdue,
      ] = await Promise.all([
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
            responsibleUser: { select: { name: true } },
            // Řešitelé + dohled (obsahuje i userId/role pro canWorkOnTask).
            ...taskPeopleSelect,
            _count: {
              select: { events: { where: { type: "DEADLINE_POSTPONED" } } },
            },
          },
        }),
        loadTaskFormOptions(prisma, currentUser),
        canAccessModule(currentUser, "module.workLogs"),
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
        tasks: visibleTasks.map(({ _count, ...task }) => ({
          ...task,
          people: taskPeopleFromRecord(task),
          // Inline změna statusu: řešitelé, zadavatel, odpovědná osoba i dohled.
          canWork: canWorkOnTask(currentUser, task),
          postponeCount: _count.events,
        })),
        truncated,
        formOptions,
        canLogWork,
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
        currentUserId: currentUser.id,
      };
    },
  );
  const visibleColumnSet = new Set(result.data.tableView.visibleColumns);
  const { users, subjects, projects, cases } = result.data.formOptions;
  // Dialog „Vykázat práci“ (?logWork=<id>) se zavře / po uložení vrátí na
  // stejný filtrovaný seznam.
  const listHref = hrefWithout("/tasks", params, ["logWork"]);
  const logWorkHref = (taskId: string) =>
    hrefWithout("/tasks", params, ["logWork"], { logWork: taskId });

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
        <StatCard
          label="Ke kontrole"
          value={result.data.cards.review}
          icon={ClipboardCheck}
          href="/tasks?status=FOR_REVIEW"
        />
        <StatCard
          label="Čeká na klienta"
          value={result.data.cards.waitingClient}
          icon={Hourglass}
          href="/tasks?status=WAITING_FOR_CLIENT"
        />
        <StatCard
          label="Čeká na protistranu"
          value={result.data.cards.waitingCounterparty}
          icon={Clock3}
          href="/tasks?status=WAITING_FOR_COUNTERPARTY"
        />
        <StatCard
          label="Po termínu"
          value={result.data.cards.overdue}
          icon={AlertTriangle}
          tone="danger"
          href="/tasks?overdue=1"
        />
      </div>
      <Section>
        <form
          key={filterFormKey(params, ["logWork"])}
          className="grid gap-3 lg:grid-cols-4 xl:grid-cols-5"
        >
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
          <CascadingMatterSelect
            subjects={subjects}
            projects={projects}
            cases={cases.map((legalCase) => ({
              id: legalCase.id,
              name: legalCase.name,
              projectId: legalCase.projectId,
              projectName: legalCase.project.name,
            }))}
            defaultSubjectId={subjectId}
            defaultProjectId={projectId}
            defaultCaseId={caseId}
            filterMode
          />
          <Field label="Řešitel">
            <SelectInput name="assignedToId" defaultValue={assignedToId}>
              <option value="">Všichni řešitelé</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Dohled">
            <SelectInput name="supervisorId" defaultValue={supervisorId}>
              <option value="">Bez filtru dohledu</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Zadavatel">
            <SelectInput name="createdById" defaultValue={createdById}>
              <option value="">Všichni zadavatelé</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Odpovědná osoba">
            <SelectInput name="responsibleUserId" defaultValue={responsibleUserId}>
              <option value="">Všechny osoby</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
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
          {status ||
          priority ||
          assignedToId ||
          supervisorId ||
          createdById ||
          responsibleUserId ||
          subjectId ||
          projectId ||
          caseId ||
          deadlineType ||
          overdueOnly ||
          sort !== "deadline" ||
          archive !== "active" ? (
            <ButtonLink href="/tasks" variant="ghost" className="self-end">
              Zrušit filtry
            </ButtonLink>
          ) : null}
        </form>
      </Section>
      <Section title="Seznam úkolů">
        <ColumnVisibilityPanel
          tableKey="tasks"
          columns={result.data.tableView.columns}
          visibleColumns={result.data.tableView.visibleColumns}
        />
        <TaskStatusLegend />
        {result.data.truncated ? (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Zobrazeno prvních {TASK_LIST_LIMIT} úkolů. Pro zobrazení dalších
            zpřesněte filtr výše.
          </p>
        ) : null}
        {result.data.tasks.length > 0 ? (
          <RowClickNav>
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
                  <tr
                    key={task.id}
                    data-href={`/tasks/${task.id}`}
                    tabIndex={0}
                    aria-label={`Otevřít úkol ${task.title}`}
                    title="Kliknutím otevřete podrobnosti úkolu"
                    className={`${taskStatusRowClass(task.status)} cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-900`}
                  >
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
                      <td>
                        <PeopleCell
                          names={task.people.assignees.map((person) => person.name)}
                        />
                      </td>
                    ) : null}
                    {visibleColumnSet.has("supervisors") ? (
                      <td>
                        <PeopleCell
                          names={task.people.supervisors.map((person) => person.name)}
                        />
                      </td>
                    ) : null}
                    {visibleColumnSet.has("responsiblePerson") ? (
                      <td>{task.responsibleUser?.name ?? "—"}</td>
                    ) : null}
                    {visibleColumnSet.has("status") ? (
                      <td className="min-w-80">
                        {task.canWork ? (
                          <form action={updateTaskStatus} className="grid min-w-0 gap-2">
                            <input type="hidden" name="taskId" value={task.id} />
                            <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
                              <SelectInput
                                name="status"
                                defaultValue={task.status}
                                aria-label={`Status úkolu ${task.title}`}
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
                              aria-label={`Komentář ke změně statusu úkolu ${task.title}`}
                              className="min-w-0"
                            />
                          </form>
                        ) : null}
                        <Badge
                          tone={taskStatusTone(task.status)}
                          className={task.canWork ? "mt-2" : undefined}
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
                      <td>{formatDateUtc(task.startDate)}</td>
                    ) : null}
                    {visibleColumnSet.has("deadline") ? (
                      <td
                        className={
                          isTaskOverdue(task.deadline, task.status, now)
                            ? "font-semibold text-red-700"
                            : undefined
                        }
                      >
                        {formatDateUtc(task.deadline)}
                        {task.postponeCount > 0 ? (
                          <Badge tone="amber" className="ml-2 whitespace-nowrap">
                            odloženo {task.postponeCount}×
                          </Badge>
                        ) : null}
                      </td>
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
                      <div className="flex flex-wrap gap-2">
                        <ButtonLink
                          href={`/tasks/${task.id}`}
                          variant="ghost"
                          className="h-8 px-3"
                        >
                          Podrobnosti
                        </ButtonLink>
                        {result.data.canLogWork ? (
                          <ButtonLink
                            href={logWorkHref(task.id)}
                            variant="ghost"
                            className="h-8 whitespace-nowrap px-3"
                            title="Vykázat práci k úkolu"
                          >
                            Vykázat práci
                          </ButtonLink>
                        ) : null}
                        <ButtonLink
                          href={`/tasks/new?duplicate=${task.id}`}
                          variant="ghost"
                          className="h-8 px-3"
                          title="Duplikovat úkol (uložit jako nový)"
                        >
                          Duplikovat
                        </ButtonLink>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </RowClickNav>
        ) : (
          <EmptyState>Žádné úkoly neodpovídají filtrům.</EmptyState>
        )}
      </Section>
      <Section title="Nový úkol" id="new-task" className="scroll-mt-6">
        <TaskCreateForm
          options={result.data.formOptions}
          currentUserId={result.data.currentUserId}
          defaultProjectId={projectId}
          defaultCaseId={caseId}
        />
      </Section>
      {result.data.canLogWork && logWorkTaskId ? (
        <TaskWorkLogDialog taskId={logWorkTaskId} closeHref={listHref} />
      ) : null}
    </>
  );
}
