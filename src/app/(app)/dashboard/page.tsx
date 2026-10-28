import Link from "next/link";
import {
  AlarmClock,
  CheckCircle2,
  Clock3,
  ListChecks,
  ListTodo,
  Settings,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import { CalendarView } from "@/components/calendar/calendar-view";
import { getOutlookFeedSummary } from "@/lib/calendar/outlook-feed.server";
import type { OutlookFeedSummary } from "@/lib/calendar/outlook-summary";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { StatCard } from "@/components/stat-card";
import { HoursKpiChart, type HoursKpiSummary } from "@/components/hours-kpi-chart";
import { HoursKpiTabs } from "@/components/hours-kpi-tabs";
import { DashboardWidgetGrid } from "@/components/dashboard-widget-grid";
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
  DeadlineType,
} from "@/generated/prisma/enums";
import { activeTaskCount, statusCount } from "@/lib/dashboard/task-counts";
import { cn } from "@/lib/utils";
import {
  dashboardTableColumns,
  dashboardWidgetHref,
  ensureDefaultDashboardWidgets,
  filterAllowedWidgets,
  getVisibleDashboardColumns,
} from "@/lib/dashboard-widgets";
import { formatDate, formatDateUtc, formatHours, formatMoney } from "@/lib/format";
import {
  DAY_MS,
  dailyKpiBuckets,
  fulfillmentPercent,
  hoursPlanFromRecord,
  isBillableKpiHours,
  officeWeekStartUtcMs,
  periodTargets,
  sumKpiBuckets,
  weeklyKpiBuckets,
  type HoursKpiBucket,
} from "@/lib/hours-plan";
import { officeWorkDate } from "@/lib/hr/attendance-calc";
import {
  approvalStatusLabels,
  billingStatusLabels,
  caseStatusLabels,
  projectStatusLabels,
  subjectTypeLabels,
  taskPriorityLabels,
  taskStatusLabels,
  deadlineTypeLabels,
} from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleModules } from "@/lib/module-access.server";
import {
  andWhere,
  canApproveWorkLogs,
  canManageUsers,
  canViewRates,
  caseVisibilityWhere,
  projectVisibilityWhere,
  referenceVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
  deadlineVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  formatAssigneeNames,
  taskPeopleFromRecord,
  taskPeopleSelect,
  taskPersonWhere,
} from "@/lib/tasks/task-people";
import { redactBirthNumberQuery } from "@/lib/subjects/birth-number";
import {
  billingStatusTone,
  deadlineTypeTone,
  taskStatusTone,
} from "@/lib/status-tones";
import {
  normalizeCalendarView,
  type CalendarDefaultView,
} from "@/lib/calendar-view";

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
    assigneeNames: string;
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
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    dueDate: Date;
    type: DeadlineType;
    case: { id: string; name: string };
    responsibleUser: { name: string } | null;
  }>;
  // Přehled hodin (KPI): vlastní výkazy přihlášeného uživatele.
  hoursKpi: {
    week: { buckets: HoursKpiBucket[]; summary: HoursKpiSummary };
    month: { buckets: HoursKpiBucket[]; summary: HoursKpiSummary };
  };
  canManageUsers: boolean;
  canViewRates: boolean;
  canApprove: boolean;
  calendarDefaultView: CalendarDefaultView;
  outlook: OutlookFeedSummary | null;
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
  upcomingDeadlines: [],
  hoursKpi: {
    week: {
      buckets: [],
      summary: { label: "Tento týden", total: 0, billable: 0, totalTarget: null, billableTarget: null },
    },
    month: {
      buckets: [],
      summary: { label: "Tento měsíc", total: 0, billable: 0, totalTarget: null, billableTarget: null },
    },
  },
  canManageUsers: false,
  canViewRates: false,
  canApprove: false,
  calendarDefaultView: "dayGridMonth",
  outlook: null,
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
    <th key={column} className="whitespace-nowrap" data-column={column}>
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
    <div className="table-scroll">
      <table className="w-max min-w-full table-auto">
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
    "align-top",
    ["description", "title", "name", "subject", "project", "case"].includes(
      column,
    )
      ? "min-w-40 max-w-80 whitespace-normal"
      : "whitespace-nowrap",
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
        <Link href={`/tasks/${task.id}`} className="font-medium text-[#0e1822] hover:underline">
          {task.title}
        </Link>
      );
    case "subject":
      return subject ? (
        <Link href={`/subjects/${subject.id}`} className="text-[#0e1822] hover:underline">
          {subject.name}
        </Link>
      ) : (
        "—"
      );
    case "project":
      return task.project ? (
        <Link href={`/projects/${task.project.id}`} className="text-[#0e1822] hover:underline">
          {task.project.name}
        </Link>
      ) : (
        "—"
      );
    case "case":
      return task.case ? (
        <Link href={`/cases/${task.case.id}`} className="text-[#0e1822] hover:underline">
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
      return formatDateUtc(task.deadline);
    case "responsibleUser":
      return task.responsibleUser?.name ?? "—";
    case "assignedTo":
      return task.assigneeNames || "—";
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
      return formatDateUtc(log.workDate);
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
        <Link href={`/subjects/${subject.id}`} className="font-medium text-[#0e1822] hover:underline">
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
        <Link href={`/projects/${project.id}`} className="font-medium text-[#0e1822] hover:underline">
          {project.name}
        </Link>
      );
    case "subject":
      return project.mainSubject ? (
        <Link
          href={`/subjects/${project.mainSubject.id}`}
          className="text-[#0e1822] hover:underline"
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
        <Link href={`/cases/${legalCase.id}`} className="font-medium text-[#0e1822] hover:underline">
          {legalCase.name}
        </Link>
      );
    case "fileNumber":
      return legalCase.fileNumber ?? "—";
    case "project":
      return (
        <Link href={`/projects/${legalCase.project.id}`} className="text-[#0e1822] hover:underline">
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
          className="font-medium text-[#0e1822] hover:underline"
        >
          {reference.title}
        </Link>
      );
    case "legalArea":
      return reference.legalArea ?? "—";
    case "value":
      return formatMoney(reference.valueCzk as never);
    case "period":
      return `${formatDateUtc(reference.startDate)} – ${
        reference.endDate ? formatDateUtc(reference.endDate) : "Probíhající"
      }`;
    case "subject":
      return reference.subject ? (
        <Link href={`/subjects/${reference.subject.id}`} className="text-[#0e1822] hover:underline">
          {reference.subject.name}
        </Link>
      ) : (
        "—"
      );
    case "project":
      return reference.project ? (
        <Link href={`/projects/${reference.project.id}`} className="text-[#0e1822] hover:underline">
          {reference.project.name}
        </Link>
      ) : (
        "—"
      );
    case "case":
      return reference.case ? (
        <Link href={`/cases/${reference.case.id}`} className="text-[#0e1822] hover:underline">
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
          href={dashboardWidgetHref(widget.type)}
        />
      );
    case DashboardWidgetType.OVERDUE_TASKS:
      return (
        <StatCard
          label={widget.title}
          value={data.counts.overdueTasks}
          icon={Clock3}
          tone="danger"
          href={dashboardWidgetHref(widget.type)}
        />
      );
    case DashboardWidgetType.FOR_REVIEW_TASKS:
      return (
        <StatCard
          label={widget.title}
          value={data.counts.reviewTasks}
          icon={ListChecks}
          href={dashboardWidgetHref(widget.type)}
        />
      );
    case DashboardWidgetType.WAITING_FOR_CLIENT_TASKS:
      return (
        <StatCard
          label={widget.title}
          value={data.counts.waitingForClientTasks}
          icon={UserRound}
          href={dashboardWidgetHref(widget.type)}
        />
      );
    case DashboardWidgetType.WAITING_FOR_COUNTERPARTY_TASKS:
      return (
        <StatCard
          label={widget.title}
          value={data.counts.waitingForCounterpartyTasks}
          icon={ShieldAlert}
          href={dashboardWidgetHref(widget.type)}
        />
      );
    case DashboardWidgetType.WORK_LOGS_SUMMARY:
      return (
        <StatCard
          label={widget.title}
          value={`${data.monthHours} h`}
          icon={CheckCircle2}
          href={dashboardWidgetHref(widget.type)}
        />
      );
    case DashboardWidgetType.WEEKLY_HOURS_CHART: {
      const { week, month } = data.hoursKpi;
      const planHint = data.canManageUsers ? (
        <p>
          Plán hodin nenastaven –{" "}
          <Link
            href="/settings#plan-hodin"
            className="font-medium text-[#0e1822] underline underline-offset-2"
          >
            nastavit v Nastavení → Plán hodin pracovníků
          </Link>
          .
        </p>
      ) : (
        <p>
          Plán hodin nenastaven – nastaví ho administrátor v Nastavení → Plán
          hodin pracovníků.
        </p>
      );
      const emptyHint = (label: string) => (
        <p>
          {label} zatím nemáte vykázané žádné hodiny.{" "}
          <Link
            href="/work-logs?new=1"
            className="font-medium text-[#0e1822] underline underline-offset-2"
          >
            Zapsat výkaz
          </Link>
        </p>
      );
      const monthPct = fulfillmentPercent(
        month.summary.total,
        month.summary.totalTarget,
      );
      const monthBillablePct = fulfillmentPercent(
        month.summary.billable,
        month.summary.billableTarget,
      );
      return (
        <Section title={widget.title} data-widget="hours-kpi">
          {/* Rozložení podle šířky widgetu (container query), ne podle
              viewportu: u velikosti „Malý“ je widget úzký i na širokém
              monitoru, dlaždice proto musí zůstat pod grafem. */}
          <div className="@container/hours-kpi min-w-0">
            <div
              className="grid min-w-0 gap-5 @3xl/hours-kpi:grid-cols-[minmax(0,3fr)_minmax(12rem,1fr)] @3xl/hours-kpi:items-stretch"
              data-hours-kpi-layout
            >
              <div className="min-w-0">
                <HoursKpiTabs
                  tabs={[
                    {
                      id: "week",
                      label: "Týden",
                      content: (
                        <HoursKpiChart
                          caption="Vykázané hodiny tento týden po dnech"
                          buckets={week.buckets}
                          summary={week.summary}
                          emptyHint={emptyHint("Tento týden")}
                          planHint={planHint}
                        />
                      ),
                    },
                    {
                      id: "month",
                      label: "Měsíc",
                      content: (
                        <HoursKpiChart
                          caption="Vykázané hodiny tento měsíc po týdnech"
                          buckets={month.buckets}
                          summary={month.summary}
                          emptyHint={emptyHint("Tento měsíc")}
                          planHint={planHint}
                        />
                      ),
                    },
                  ]}
                />
              </div>
              <Link
                href="/work-logs"
                className="group flex min-h-40 flex-col justify-between rounded-xl border border-emerald-900/15 bg-emerald-950 px-5 py-5 text-white transition hover:-translate-y-0.5 hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
                aria-label={`Moje hodiny tento měsíc: ${formatHours(month.summary.total)} hodin, z toho fakturovatelné ${formatHours(month.summary.billable)} hodin. Otevřít výkazy práce.`}
              >
                <span className="text-sm font-semibold text-emerald-100">
                  Moje hodiny tento měsíc
                </span>
                <span className="mt-6 text-4xl font-semibold tracking-tight">
                  {formatHours(month.summary.total)} h
                </span>
                <span className="mt-2 grid gap-0.5 text-sm text-emerald-100">
                  {monthPct != null ? (
                    <span>celkem {monthPct} % plánu</span>
                  ) : null}
                  <span>
                    fakturovatelné {formatHours(month.summary.billable)} h
                    {monthBillablePct != null
                      ? ` · ${monthBillablePct} % cíle`
                      : ""}
                  </span>
                </span>
                <span className="mt-3 text-xs text-emerald-100/80 group-hover:text-white">
                  Otevřít výkazy práce →
                </span>
              </Link>
            </div>
          </div>
        </Section>
      );
    }
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
    case DashboardWidgetType.WORK_LOGS_TABLE: {
      // Drop rate/amount columns for roles that may not see pricing.
      const workLogColumns = columns.filter((column) => {
        if (
          !data.canViewRates &&
          (column === "hourlyRate" || column === "amount")
        ) {
          return false;
        }
        return data.canApprove || column !== "approvalStatus";
      });
      return (
        <Section title={widget.title}>
          {data.workLogs.length > 0 ? (
            <DashboardTable type={widget.type} columns={workLogColumns}>
              {data.workLogs.map((log) => (
                <tr key={log.id}>
                  {workLogColumns.map((column) => (
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
    }
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
            <div className="table-scroll">
              <table className="w-max min-w-full table-auto">
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
                      <td className="break-words font-medium text-[#0e1822]">
                        {redactBirthNumberQuery(check.searchedQuery)}
                      </td>
                      <td className="break-words">
                        {check.subject ? (
                          <Link
                            href={`/subjects/${check.subject.id}`}
                            className="text-[#0e1822] hover:underline"
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
        <CalendarView
          compact
          title={widget.title}
          initialView={data.calendarDefaultView}
          outlook={data.outlook}
        />
      );
    case DashboardWidgetType.DEADLINES_PREVIEW:
      return (
        <Section title={widget.title}>
          <div className="mb-3 flex justify-end">
            <ButtonLink
              href={dashboardWidgetHref(widget.type) ?? "/deadlines"}
              variant="ghost"
              className="h-8 px-3"
            >
              Všechny lhůty
            </ButtonLink>
          </div>
          {data.upcomingDeadlines.length > 0 ? (
            <div className="grid gap-2">
              {data.upcomingDeadlines.map((deadline) => (
                <Link
                  key={deadline.id}
                  href={`/cases/${deadline.case.id}`}
                  className="flex min-w-0 items-start gap-3 rounded-md border border-[#dce4e8] bg-[#F4F7F8]/55 p-3 transition hover:bg-[#F4F7F8]"
                >
                  <AlarmClock className="mt-0.5 h-4 w-4 shrink-0 text-[#0e1822]" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[#0e1822]">
                      {deadline.title}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-2 text-xs text-[#566673]">
                      <Badge tone={deadlineTypeTone(deadline.type)}>
                        {deadlineTypeLabels[deadline.type]}
                      </Badge>
                      <span>{formatDateUtc(deadline.dueDate)}</span>
                      <span>{deadline.case.name}</span>
                      {deadline.responsibleUser ? (
                        <span>{deadline.responsibleUser.name}</span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState>Žádné blížící se lhůty.</EmptyState>
          )}
        </Section>
      );
  }
}

// Runs the query only when its widget's module is accessible; otherwise the
// widget is not rendered and its data is never loaded.
function when<T>(ok: boolean, query: () => Promise<T>, fallback: T): Promise<T> {
  return ok ? query() : Promise.resolve(fallback);
}

export default async function DashboardPage() {
  const now = new Date();
  // Hranice podle kancelářského dne (Europe/Prague) jako UTC půlnoci — workDate
  // je uložený na UTC půlnoc, takže úkon nespadne do vedlejšího dne/týdne
  // (ani v pondělí po půlnoci pražského času, kdy je v UTC ještě neděle).
  const officeToday = officeWorkDate(now);
  const todayMs = officeToday.getTime();
  const monthStartMs = Date.UTC(
    officeToday.getUTCFullYear(),
    officeToday.getUTCMonth(),
    1,
  );
  const nextMonthStartMs = Date.UTC(
    officeToday.getUTCFullYear(),
    officeToday.getUTCMonth() + 1,
    1,
  );
  const monthStart = new Date(monthStartMs);
  const nextMonthStart = new Date(nextMonthStartMs);
  const weekStartMs = officeWeekStartUtcMs(now);
  const weekEndMs = weekStartMs + 7 * DAY_MS;
  const hoursRangeStart = new Date(Math.min(weekStartMs, monthStartMs));
  const hoursRangeEnd = new Date(Math.max(weekEndMs, nextMonthStartMs));

  const result = await safeQuery<DashboardData>(fallbackData, async () => {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();

    await ensureDefaultDashboardWidgets(currentUser.id);

    // Widgets (and their data) only for modules the user may open.
    const allowedModules = await getAccessibleModules(currentUser);
    const allowedSet = new Set<string>(allowedModules);
    const can = (key: string) => allowedSet.has(key);

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
      taskStatusGroups,
      overdueTasks,
      workLogAggregate,
      myTasks,
      workLogs,
      subjects,
      projects,
      cases,
      references,
      recentChecks,
      upcomingDeadlines,
      ownHoursGroups,
      hoursPlan,
      notificationPreference,
      approvalAssignmentCount,
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
      }),
      // One grouped scan instead of four separate COUNT queries; the active
      // total and each per-status card are derived from this result below.
      when(
        can("module.tasks"),
        () =>
          prisma.task.groupBy({
            by: ["status"],
            where: andWhere({ archivedAt: null }, taskAccessWhere),
            _count: { _all: true },
          }),
        [],
      ),
      when(
        can("module.tasks"),
        () =>
          prisma.task.count({
            where: andWhere(activeTaskWhere, { deadline: { lt: now } }),
          }),
        0,
      ),
      when(
        can("module.workLogs"),
        () =>
          prisma.workLog.aggregate({
            where: andWhere(activeWorkLogWhere, {
              workDate: {
                gte: monthStart,
                lt: nextMonthStart,
              },
            }),
            _sum: { hours: true },
          }),
        { _sum: { hours: null } },
      ),
      when(
        can("module.tasks"),
        () =>
          prisma.task.findMany({
            where: {
              organizationId: currentUser.organizationId,
              archivedAt: null,
              status: { not: TaskStatus.COMPLETED },
              // Řešitel (hlavní i další), dohled, odpovědná osoba, zadavatel.
              OR: [
                taskPersonWhere(currentUser.id),
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
              ...taskPeopleSelect,
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
        [],
      ),
      when(
        can("module.workLogs"),
        () =>
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
        [],
      ),
      when(
        can("module.subjects"),
        () =>
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
        [],
      ),
      when(
        can("module.projects"),
        () =>
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
        [],
      ),
      when(
        can("module.cases"),
        () =>
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
        [],
      ),
      when(
        can("module.references"),
        () =>
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
        [],
      ),
      when(
        can("module.conflictCheck"),
        () =>
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
        [],
      ),
      when(
        can("module.deadlines"),
        () =>
          prisma.deadline.findMany({
            where: andWhere(
              {
                archivedAt: null,
                status: "OPEN",
                dueDate: { gte: now },
              },
              deadlineVisibilityWhere(currentUser),
            ),
            orderBy: { dueDate: "asc" },
            take: 8,
            select: {
              id: true,
              title: true,
              dueDate: true,
              type: true,
              case: { select: { id: true, name: true } },
              responsibleUser: { select: { name: true } },
            },
          }),
        [],
      ),
      // Vlastní výkazy přihlášeného uživatele (týden ∪ měsíc) pro Přehled
      // hodin — jeden groupBy, fakturovatelnost podle billing/approval statusu.
      when(
        can("module.workLogs"),
        () =>
          prisma.workLog.groupBy({
            by: ["workDate", "billingStatus", "approvalStatus"],
            where: {
              organizationId: currentUser.organizationId,
              userId: currentUser.id,
              archivedAt: null,
              workDate: { gte: hoursRangeStart, lt: hoursRangeEnd },
            },
            _sum: { hours: true },
          }),
        [],
      ),
      prisma.userHoursPlan.findUnique({
        where: { userId: currentUser.id },
        select: {
          weeklyHoursTarget: true,
          monthlyHoursTarget: true,
          weeklyBillableHoursTarget: true,
          monthlyBillableHoursTarget: true,
        },
      }),
      prisma.notificationPreference.findUnique({
        where: { userId: currentUser.id },
        select: { calendarDefaultView: true },
      }),
      prisma.subjectBillingApprover.count({
        where: {
          organizationId: currentUser.organizationId,
          userId: currentUser.id,
        },
      }),
    ]);

    const plan = hoursPlanFromRecord(hoursPlan);
    const kpiEntries = ownHoursGroups.map((group) => ({
      workDate: group.workDate,
      hours: Number(group._sum.hours ?? 0),
      billable: isBillableKpiHours(group.billingStatus, group.approvalStatus),
    }));
    const weekBuckets = dailyKpiBuckets(weekStartMs, weekEndMs, kpiEntries, plan, {
      todayMs,
    });
    const monthBuckets = weeklyKpiBuckets(
      monthStartMs,
      nextMonthStartMs,
      kpiEntries,
      plan,
      { todayMs },
    );
    const weekTargets = periodTargets(plan, weekStartMs, weekEndMs);
    const monthTargets = periodTargets(plan, monthStartMs, nextMonthStartMs);

    return {
      widgets: filterAllowedWidgets(widgets, allowedModules),
      counts: {
        activeTasks: activeTaskCount(taskStatusGroups),
        overdueTasks,
        reviewTasks: statusCount(taskStatusGroups, TaskStatus.FOR_REVIEW),
        waitingForClientTasks: statusCount(
          taskStatusGroups,
          TaskStatus.WAITING_FOR_CLIENT,
        ),
        waitingForCounterpartyTasks: statusCount(
          taskStatusGroups,
          TaskStatus.WAITING_FOR_COUNTERPARTY,
        ),
      },
      monthHours: formatHours(workLogAggregate._sum.hours),
      myTasks: myTasks.map((task) => ({
        ...task,
        assigneeNames: formatAssigneeNames(taskPeopleFromRecord(task).assignees),
      })),
      workLogs,
      subjects,
      projects,
      cases,
      references,
      recentChecks,
      upcomingDeadlines,
      hoursKpi: {
        week: {
          buckets: weekBuckets,
          summary: {
            label: "Tento týden",
            ...sumKpiBuckets(weekBuckets),
            totalTarget: weekTargets.total,
            billableTarget: weekTargets.billable,
          },
        },
        month: {
          buckets: monthBuckets,
          summary: {
            label: "Tento měsíc",
            ...sumKpiBuckets(monthBuckets),
            totalTarget: monthTargets.total,
            billableTarget: monthTargets.billable,
          },
        },
      },
      canManageUsers: canManageUsers(currentUser),
      canViewRates: canViewRates(currentUser),
      canApprove:
        canApproveWorkLogs(currentUser) || approvalAssignmentCount > 0,
      calendarDefaultView: normalizeCalendarView(
        notificationPreference?.calendarDefaultView,
      ),
      outlook: await getOutlookFeedSummary(currentUser),
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
        <DashboardWidgetGrid
          initialWidgets={result.data.widgets.map((widget) => ({
            id: widget.id,
            title: widget.title,
            type: widget.type,
            size: widget.size,
            content: renderWidget(widget, result.data),
          }))}
        />
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
