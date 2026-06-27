import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  ListChecks,
  ListTodo,
  Settings,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ApprovalStatus,
  BillingStatus,
  CaseStatus,
  DashboardWidgetSize,
  DashboardWidgetType,
  ProjectStatus,
  SubjectType,
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import {
  dashboardTableColumns,
  ensureDefaultDashboardWidgets,
  getVisibleDashboardColumns,
} from "@/lib/dashboard-widgets";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import {
  approvalStatusLabels,
  billingStatusLabels,
  caseStatusLabels,
  projectStatusLabels,
  subjectTypeLabels,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { getCurrentUser } from "@/lib/auth";
import {
  andWhere,
  caseVisibilityWhere,
  projectVisibilityWhere,
  referenceVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { LIST_QUERY_LIMIT } from "@/lib/query-limits";
import { billingStatusTone, taskStatusTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type DashboardWidgetView = {
  id: string;
  type: DashboardWidgetType;
  title: string;
  size: DashboardWidgetSize;
  config: unknown;
};

type DashboardData = {
  widgets: DashboardWidgetView[];
  counts: {
    activeTasks: number;
    overdueTasks: number;
    reviewTasks: number;
    waitingForClientTasks: number;
    waitingForCounterpartyTasks: number;
  };
  monthHours: string;
  myTasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    deadline: Date | null;
    assignedTo: { name: string } | null;
    responsibleUser: { name: string } | null;
    project: {
      id: string;
      name: string;
      mainSubject: { id: string; name: string } | null;
    } | null;
    case: {
      id: string;
      name: string;
      fileNumber: string | null;
      project: { mainSubject: { id: string; name: string } | null };
    } | null;
  }>;
  workLogs: Array<{
    id: string;
    workDate: Date;
    hours: unknown;
    hourlyRate: unknown;
    amountCzk: unknown;
    description: string | null;
    billingStatus: BillingStatus;
    approvalStatus: ApprovalStatus;
    legalArea: string | null;
    subject: { name: string } | null;
    project: { name: string } | null;
    case: { name: string; fileNumber: string | null } | null;
    task: { title: string } | null;
    user: { name: string } | null;
  }>;
  subjects: Array<{
    id: string;
    name: string;
    type: SubjectType;
    ico: string | null;
    riskFlag: boolean;
    status: string;
    createdAt: Date;
  }>;
  projects: Array<{
    id: string;
    name: string;
    status: ProjectStatus;
    createdAt: Date;
    mainSubject: { id: string; name: string } | null;
    responsibleUser: { name: string } | null;
  }>;
  cases: Array<{
    id: string;
    name: string;
    fileNumber: string | null;
    status: CaseStatus;
    createdAt: Date;
    project: { id: string; name: string };
    responsibleUser: { name: string } | null;
  }>;
  references: Array<{
    id: string;
    title: string;
    legalArea: string | null;
    valueCzk: unknown;
    startDate: Date | null;
    endDate: Date | null;
    description: string | null;
    subject: { id: string; name: string } | null;
    project: { id: string; name: string } | null;
    case: { id: string; name: string; fileNumber: string | null } | null;
  }>;
  recentChecks: Array<{
    id: string;
    searchedQuery: string;
    resultStatus: string;
    createdAt: Date;
    subject: { id: string; name: string } | null;
  }>;
  calendarTasks: Array<{
    id: string;
    title: string;
    deadline: Date | null;
    status: TaskStatus;
    project: { id: string; name: string } | null;
  }>;
};

const fallbackData: DashboardData = {
  widgets: [],
  counts: {
    activeTasks: 0,
    overdueTasks: 0,
    reviewTasks: 0,
    waitingForClientTasks: 0,
    waitingForCounterpartyTasks: 0,
  },
  monthHours: "0",
  myTasks: [],
  workLogs: [],
  subjects: [],
  projects: [],
  cases: [],
  references: [],
  recentChecks: [],
  calendarTasks: [],
};

const sizeClasses: Record<DashboardWidgetSize, string> = {
  SMALL: "lg:col-span-4",
  MEDIUM: "lg:col-span-6",
  LARGE: "lg:col-span-8",
  FULL: "lg:col-span-12",
};

function subjectFromTask(task: DashboardData["myTasks"][number]) {
  return task.project?.mainSubject ?? task.case?.project.mainSubject ?? null;
}

function tableHeaders(type: DashboardWidgetType, columns: string[]) {
  const labels = Object.fromEntries(
    (dashboardTableColumns[type] ?? []).map((column) => [
      column.key,
      column.label,
    ]),
  );

  return columns.map((column) => (
    <th key={column} className="break-words" data-column={column}>
      {labels[column] ?? column}
    </th>
  ));
}

function DashboardTable({
  type,
  columns,
  children,
}: {
  type: DashboardWidgetType;
  columns: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-full overflow-x-hidden">
      <table className="table-fixed">
        <thead>
          <tr>{tableHeaders(type, columns)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function cellClass(column: string) {
  return cn(
    "break-words align-top",
    ["description", "title", "name"].includes(column) ? "min-w-0" : "",
  );
}

function renderTaskCell(
  task: DashboardData["myTasks"][number],
  column: string,
) {
  const subject = subjectFromTask(task);

  switch (column) {
    case "title":
      return (
        <Link href={`/tasks/${task.id}`} className="font-medium text-[#072924] hover:underline">
          {task.title}
        </Link>
      );
    case "subject":
      return subject ? (
        <Link href={`/subjects/${subject.id}`} className="text-[#072924] hover:underline">
          {subject.name}
        </Link>
      ) : (
        "—"
      );
    case "project":
      return task.project ? (
        <Link href={`/projects/${task.project.id}`} className="text-[#072924] hover:underline">
          {task.project.name}
        </Link>
      ) : (
        "—"
      );
    case "case":
      return task.case ? (
        <Link href={`/cases/${task.case.id}`} className="text-[#072924] hover:underline">
          {task.case.name}
          {task.case.fileNumber ? `, ${task.case.fileNumber}` : ""}
        </Link>
      ) : (
        "—"
      );
    case "status":
      return (
        <Badge tone={taskStatusTone(task.status)}>
          {taskStatusLabels[task.status]}
        </Badge>
      );
    case "deadline":
      return formatDate(task.deadline);
    case "responsibleUser":
      return task.responsibleUser?.name ?? "—";
    case "assignedTo":
      return task.assignedTo?.name ?? "—";
    case "priority":
      return taskPriorityLabels[task.priority];
    default:
      return "—";
  }
}

function renderWorkLogCell(
  log: DashboardData["workLogs"][number],
  column: string,
) {
  switch (column) {
    case "date":
      return formatDate(log.workDate);
    case "subject":
      return log.subject?.name ?? "—";
    case "project":
      return log.project?.name ?? "—";
    case "case":
      return log.case
        ? `${log.case.name}${log.case.fileNumber ? `, ${log.case.fileNumber}` : ""}`
        : "—";
    case "task":
      return log.task?.title ?? "—";
    case "user":
      return log.user?.name ?? "—";
    case "hours":
      return formatHours(log.hours as never);
    case "hourlyRate":
      return formatMoney(log.hourlyRate as never);
    case "amount":
      return formatMoney(log.amountCzk as never);
    case "description":
      return log.description ?? "—";
    case "legalArea":
      return log.legalArea ?? "—";
    case "billingStatus":
      return (
        <Badge tone={billingStatusTone(log.billingStatus)}>
          {billingStatusLabels[log.billingStatus]}
        </Badge>
      );
    case "approvalStatus":
      return <Badge tone="blue">{approvalStatusLabels[log.approvalStatus]}</Badge>;
    default:
      return "—";
  }
}

function renderSubjectCell(
  subject: DashboardData["subjects"][number],
  column: string,
) {
  switch (column) {
    case "name":
      return (
        <Link href={`/subjects/${subject.id}`} className="font-medium text-[#072924] hover:underline">
          {subject.name}
        </Link>
      );
    case "type":
      return subjectTypeLabels[subject.type];
    case "ico":
      return subject.ico ?? "—";
    case "riskFlag":
      return subject.riskFlag ? (
        <Badge tone="red">Rizikový</Badge>
      ) : (
        <Badge tone="green">Bez příznaku</Badge>
      );
    case "status":
      return subject.status;
    case "createdAt":
      return formatDate(subject.createdAt);
    default:
      return "—";
  }
}

function renderProjectCell(
  project: DashboardData["projects"][number],
  column: string,
) {
  switch (column) {
    case "name":
      return (
        <Link href={`/projects/${project.id}`} className="font-medium text-[#072924] hover:underline">
          {project.name}
        </Link>
      );
    case "subject":
      return project.mainSubject ? (
        <Link
          href={`/subjects/${project.mainSubject.id}`}
          className="text-[#072924] hover:underline"
        >
          {project.mainSubject.name}
        </Link>
      ) : (
        "—"
      );
    case "status":
      return <Badge tone="green">{projectStatusLabels[project.status]}</Badge>;
    case "responsibleUser":
      return project.responsibleUser?.name ?? "—";
    case "createdAt":
      return formatDate(project.createdAt);
    default:
      return "—";
  }
}

function renderCaseCell(
  legalCase: DashboardData["cases"][number],
  column: string,
) {
  switch (column) {
    case "name":
      return (
        <Link href={`/cases/${legalCase.id}`} className="font-medium text-[#072924] hover:underline">
          {legalCase.name}
        </Link>
      );
    case "fileNumber":
      return legalCase.fileNumber ?? "—";
    case "project":
      return (
        <Link href={`/projects/${legalCase.project.id}`} className="text-[#072924] hover:underline">
          {legalCase.project.name}
        </Link>
      );
    case "status":
      return <Badge tone="green">{caseStatusLabels[legalCase.status]}</Badge>;
    case "responsibleUser":
      return legalCase.responsibleUser?.name ?? "—";
    case "createdAt":
      return formatDate(legalCase.createdAt);
    default:
      return "—";
  }
}

function renderReferenceCell(
  reference: DashboardData["references"][number],
  column: string,
) {
  switch (column) {
    case "title":
      return (
        <Link
          href={`/references/${reference.id}/edit`}
          className="font-medium text-[#072924] hover:underline"
        >
          {reference.title}
        </Link>
      );
    case "legalArea":
      return reference.legalArea ?? "—";
    case "value":
      return formatMoney(reference.valueCzk as never);
    case "period":
      return `${formatDate(reference.startDate)} – ${
        reference.endDate ? formatDate(reference.endDate) : "Probíhající"
      }`;
    case "subject":
      return reference.subject ? (
        <Link href={`/subjects/${reference.subject.id}`} className="text-[#072924] hover:underline">
          {reference.subject.name}
        </Link>
      ) : (
        "—"
      );
    case "project":
      return reference.project ? (
        <Link href={`/projects/${reference.project.id}`} className="text-[#072924] hover:underline">
          {reference.project.name}
        </Link>
      ) : (
        "—"
      );
    case "case":
      return reference.case ? (
        <Link href={`/cases/${reference.case.id}`} className="text-[#072924] hover:underline">
          {reference.case.name}
          {reference.case.fileNumber ? `, ${reference.case.fileNumber}` : ""}
        </Link>
      ) : (
        "—"
      );
    case "description":
      return reference.description ?? "—";
    default:
      return "—";
  }
}

function renderWidget(widget: DashboardWidgetView, data: DashboardData) {
  const columns = getVisibleDashboardColumns(widget.type, widget.config);

  switch (widget.type) {
    case DashboardWidgetType.ACTIVE_TASKS:
      return (
        <StatCard
          label={widget.title}
          value={data.counts.activeTasks}
          icon={ListTodo}
        />
      );
    case DashboardWidgetType.OVERDUE_TASKS:
      return (
        <StatCard
          label={widget.title}
          value={data.counts.overdueTasks}
          icon={Clock3}
          tone="danger"
        />
      );
    case DashboardWidgetType.FOR_REVIEW_TASKS:
      return (
        <StatCard
          label={widget.title}
          value={data.counts.reviewTasks}
          icon={ListChecks}
        />
      );
    case DashboardWidgetType.WAITING_FOR_CLIENT_TASKS:
      return (
        <StatCard
          label={widget.title}
          value={data.counts.waitingForClientTasks}
          icon={UserRound}
        />
      );
    case DashboardWidgetType.WAITING_FOR_COUNTERPARTY_TASKS:
      return (
        <StatCard
          label={widget.title}
          value={data.counts.waitingForCounterpartyTasks}
          icon={ShieldAlert}
        />
      );
    case DashboardWidgetType.WORK_LOGS_SUMMARY:
      return (
        <StatCard
          label={widget.title}
          value={`${data.monthHours} h`}
          icon={CheckCircle2}
        />
      );
    case DashboardWidgetType.MY_TASKS_TABLE:
      return (
        <Section title={widget.title}>
          {data.myTasks.length > 0 ? (
            <DashboardTable type={widget.type} columns={columns}>
              {data.myTasks.map((task) => (
                <tr key={task.id}>
                  {columns.map((column) => (
                    <td key={column} className={cellClass(column)}>
                      {renderTaskCell(task, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </DashboardTable>
          ) : (
            <EmptyState>Nemáte žádné aktivní úkoly.</EmptyState>
          )}
        </Section>
      );
    case DashboardWidgetType.WORK_LOGS_TABLE:
      return (
        <Section title={widget.title}>
          {data.workLogs.length > 0 ? (
            <DashboardTable type={widget.type} columns={columns}>
              {data.workLogs.map((log) => (
                <tr key={log.id}>
                  {columns.map((column) => (
                    <td key={column} className={cellClass(column)}>
                      {renderWorkLogCell(log, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </DashboardTable>
          ) : (
            <EmptyState>Zatím nejsou založené žádné výkazy práce.</EmptyState>
          )}
        </Section>
      );
    case DashboardWidgetType.SUBJECTS_TABLE:
      return (
        <Section title={widget.title}>
          {data.subjects.length > 0 ? (
            <DashboardTable type={widget.type} columns={columns}>
              {data.subjects.map((subject) => (
                <tr key={subject.id}>
                  {columns.map((column) => (
                    <td key={column} className={cellClass(column)}>
                      {renderSubjectCell(subject, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </DashboardTable>
          ) : (
            <EmptyState>Zatím nejsou založené žádné subjekty.</EmptyState>
          )}
        </Section>
      );
    case DashboardWidgetType.PROJECTS_TABLE:
      return (
        <Section title={widget.title}>
          {data.projects.length > 0 ? (
            <DashboardTable type={widget.type} columns={columns}>
              {data.projects.map((project) => (
                <tr key={project.id}>
                  {columns.map((column) => (
                    <td key={column} className={cellClass(column)}>
                      {renderProjectCell(project, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </DashboardTable>
          ) : (
            <EmptyState>Zatím nejsou založené žádné projekty.</EmptyState>
          )}
        </Section>
      );
    case DashboardWidgetType.CASES_TABLE:
      return (
        <Section title={widget.title}>
          {data.cases.length > 0 ? (
            <DashboardTable type={widget.type} columns={columns}>
              {data.cases.map((legalCase) => (
                <tr key={legalCase.id}>
                  {columns.map((column) => (
                    <td key={column} className={cellClass(column)}>
                      {renderCaseCell(legalCase, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </DashboardTable>
          ) : (
            <EmptyState>Zatím nejsou založené žádné případy.</EmptyState>
          )}
        </Section>
      );
    case DashboardWidgetType.REFERENCES_TABLE:
      return (
        <Section title={widget.title}>
          {data.references.length > 0 ? (
            <DashboardTable type={widget.type} columns={columns}>
              {data.references.map((reference) => (
                <tr key={reference.id}>
                  {columns.map((column) => (
                    <td key={column} className={cellClass(column)}>
                      {renderReferenceCell(reference, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </DashboardTable>
          ) : (
            <EmptyState>Zatím nejsou založené žádné reference.</EmptyState>
          )}
        </Section>
      );
    case DashboardWidgetType.RECENT_CONFLICT_CHECKS:
      return (
        <Section title={widget.title}>
          {data.recentChecks.length > 0 ? (
            <div className="max-w-full overflow-x-hidden">
              <table className="table-fixed">
                <thead>
                  <tr>
                    <th>Dotaz</th>
                    <th>Subjekt</th>
                    <th>Výsledek</th>
                    <th>Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentChecks.map((check) => (
                    <tr key={check.id}>
                      <td className="break-words font-medium text-[#072924]">
                        {check.searchedQuery}
                      </td>
                      <td className="break-words">
                        {check.subject ? (
                          <Link
                            href={`/subjects/${check.subject.id}`}
                            className="text-[#072924] hover:underline"
                          >
                            {check.subject.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="break-words">{check.resultStatus}</td>
                      <td className="break-words">{formatDate(check.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Zatím zde nejsou uložené conflict checky.</EmptyState>
          )}
        </Section>
      );
    case DashboardWidgetType.CALENDAR_PREVIEW:
      return (
        <Section title={widget.title}>
          {data.calendarTasks.length > 0 ? (
            <div className="grid gap-3">
              {data.calendarTasks.map((task) => (
                <div
                  key={task.id}
                  className="min-w-0 rounded-md border border-[#d4e2dc] bg-[#EEF5F1]/55 p-3"
                >
                  <Link
                    href={`/tasks/${task.id}`}
                    className="font-medium text-[#072924] hover:underline"
                  >
                    {task.title}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#5f756e]">
                    <Badge tone={taskStatusTone(task.status)}>
                      {taskStatusLabels[task.status]}
                    </Badge>
                    <span>{formatDate(task.deadline)}</span>
                    {task.project ? <span>{task.project.name}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Žádné nadcházející termíny.</EmptyState>
          )}
        </Section>
      );
  }
}

export default async function DashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const result = await safeQuery<DashboardData>(fallbackData, async () => {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();

    await ensureDefaultDashboardWidgets(currentUser.id);

    const taskAccessWhere = taskVisibilityWhere(currentUser);
    const activeTaskWhere = andWhere(
      {
        archivedAt: null,
        status: { not: TaskStatus.COMPLETED },
      },
      taskAccessWhere,
    );
    const activeWorkLogWhere = andWhere(
      { archivedAt: null },
      workLogVisibilityWhere(currentUser),
    );

    const [
      widgets,
      activeTasks,
      overdueTasks,
      reviewTasks,
      waitingForClientTasks,
      waitingForCounterpartyTasks,
      workLogAggregate,
      myTasks,
      workLogs,
      subjects,
      projects,
      cases,
      references,
      recentChecks,
      calendarTasks,
    ] = await Promise.all([
      prisma.dashboardWidget.findMany({
        where: {
          userId: currentUser.id,
          visible: true,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          type: true,
          title: true,
          size: true,
          config: true,
        },
        take: LIST_QUERY_LIMIT,
      }),
      prisma.task.count({ where: activeTaskWhere }),
      prisma.task.count({
        where: andWhere(activeTaskWhere, { deadline: { lt: now } }),
      }),
      prisma.task.count({
        where: andWhere(
          { archivedAt: null, status: TaskStatus.FOR_REVIEW },
          taskAccessWhere,
        ),
      }),
      prisma.task.count({
        where: andWhere(
          { archivedAt: null, status: TaskStatus.WAITING_FOR_CLIENT },
          taskAccessWhere,
        ),
      }),
      prisma.task.count({
        where: andWhere(
          {
            archivedAt: null,
            status: TaskStatus.WAITING_FOR_COUNTERPARTY,
          },
          taskAccessWhere,
        ),
      }),
      prisma.workLog.aggregate({
        where: andWhere(activeWorkLogWhere, {
          workDate: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        }),
        _sum: { hours: true },
      }),
      prisma.task.findMany({
        where: {
          organizationId: currentUser.organizationId,
          archivedAt: null,
          status: { not: TaskStatus.COMPLETED },
          OR: [
            { assignedToId: currentUser.id },
            { responsibleUserId: currentUser.id },
            { createdById: currentUser.id },
          ],
        },
        orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
        take: 8,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          deadline: true,
          assignedTo: { select: { name: true } },
          responsibleUser: { select: { name: true } },
          project: {
            select: {
              id: true,
              name: true,
              mainSubject: { select: { id: true, name: true } },
            },
          },
          case: {
            select: {
              id: true,
              name: true,
              fileNumber: true,
              project: {
                select: {
                  mainSubject: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      prisma.workLog.findMany({
        where: activeWorkLogWhere,
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: 8,
        select: {
          id: true,
          workDate: true,
          hours: true,
          hourlyRate: true,
          amountCzk: true,
          description: true,
          billingStatus: true,
          approvalStatus: true,
          legalArea: true,
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
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          name: true,
          type: true,
          ico: true,
          riskFlag: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.project.findMany({
        where: andWhere(
          { archivedAt: null },
          projectVisibilityWhere(currentUser),
        ),
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          mainSubject: { select: { id: true, name: true } },
          responsibleUser: { select: { name: true } },
        },
      }),
      prisma.case.findMany({
        where: andWhere(
          { archivedAt: null },
          caseVisibilityWhere(currentUser),
        ),
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          name: true,
          fileNumber: true,
          status: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
          responsibleUser: { select: { name: true } },
        },
      }),
      prisma.reference.findMany({
        where: andWhere(
          { archivedAt: null },
          referenceVisibilityWhere(currentUser),
        ),
        orderBy: [{ endDate: "asc" }, { createdAt: "desc" }],
        take: 8,
        select: {
          id: true,
          title: true,
          legalArea: true,
          valueCzk: true,
          startDate: true,
          endDate: true,
          description: true,
          subject: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          case: { select: { id: true, name: true, fileNumber: true } },
        },
      }),
      prisma.conflictCheck.findMany({
        where: { organizationId: currentUser.organizationId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          searchedQuery: true,
          resultStatus: true,
          createdAt: true,
          subject: { select: { id: true, name: true } },
        },
      }),
      prisma.task.findMany({
        where: andWhere(activeTaskWhere, { deadline: { gte: now } }),
        orderBy: { deadline: "asc" },
        take: 6,
        select: {
          id: true,
          title: true,
          deadline: true,
          status: true,
          project: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      widgets,
      counts: {
        activeTasks,
        overdueTasks,
        reviewTasks,
        waitingForClientTasks,
        waitingForCounterpartyTasks,
      },
      monthHours: formatHours(workLogAggregate._sum.hours),
      myTasks,
      workLogs,
      subjects,
      projects,
      cases,
      references,
      recentChecks,
      calendarTasks,
    };
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Rychlý přehled aktivní práce, konfliktů a vytížení kanceláře."
        action={
          <ButtonLink href="/dashboard/settings" variant="secondary">
            <Settings className="h-4 w-4" aria-hidden="true" />
            Nastavit dashboard
          </ButtonLink>
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      {result.data.widgets.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 overflow-x-hidden lg:grid-cols-12">
          {result.data.widgets.map((widget) => (
            <div
              key={widget.id}
              className={cn("min-w-0", sizeClasses[widget.size])}
              data-testid="dashboard-widget"
              data-widget-id={widget.id}
              data-widget-size={widget.size}
              data-widget-type={widget.type}
            >
              {renderWidget(widget, result.data)}
            </div>
          ))}
        </div>
      ) : (
        <Section>
          <EmptyState>
            Dashboard zatím nemá uložené žádné widgety. Otevřete nastavení
            dashboardu a vytvořte výchozí konfiguraci.
          </EmptyState>
        </Section>
      )}
    </>
  );
}
