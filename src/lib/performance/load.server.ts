import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  DeadlineStatus,
  HrAbsenceStatus,
  ModuleKey,
  OrganizationMemberStatus,
  TaskAssigneeRole,
  TaskStatus,
  type UserRole,
} from "@/generated/prisma/enums";
import type { getCurrentUser } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/entitlements";
import { officeWorkDate } from "@/lib/hr/attendance-calc";
import {
  DAY_MS,
  defaultTargetPreference,
  dailyKpiBuckets,
  hoursPlanFromRecord,
  isBillableKpiHours,
  periodTargets,
  weeklyKpiBuckets,
  type HoursKpiBucket,
  type HoursPlanTargets,
} from "@/lib/hours-plan";
import { canAccessModule } from "@/lib/module-access.server";
import { permissionScopeLabels } from "@/lib/permission-catalog";
import {
  andWhere,
  canManageHr,
  canManageUsers,
  deadlineVisibilityWhere,
  hrAbsenceVisibilityWhere,
  hrAttendanceVisibilityWhere,
  hrEmployeeVisibilityWhere,
  scopeOf,
  taskVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import {
  buildPerformanceRows,
  filterPerformanceRows,
  mergeCounts,
  performanceTotals,
  sortPerformanceRows,
  type AbsenceInput,
  type CountMap,
  type HoursGroup,
  type PerformanceMember,
  type PerformanceRow,
  type PerformanceTotals,
} from "@/lib/performance/metrics";
import type { PerformanceFilters } from "@/lib/performance/filters";
import {
  resolvePerformancePeriod,
  type PerformancePeriod,
} from "@/lib/performance/period";
import { getPrisma } from "@/lib/prisma";
import { taskAssigneeWhere } from "@/lib/tasks/task-people";

// Data stránky Výkonnost. Všechny dotazy jsou agregace (groupBy) přes celou
// skupinu lidí najednou — počet dotazů nezávisí na počtu zaměstnanců (bez N+1).
// Každý dotaz je složený s visibility helperem aktuálního uživatele: kdo má
// k Výkonnosti přístup s užším rozsahem dat, nevidí víc, než by viděl jinde.

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
type PrismaClient = ReturnType<typeof getPrisma>;

export const UPCOMING_DAYS = 14;

type GroupCount = { _count: { _all: number } };

function countMap<T extends GroupCount>(
  groups: readonly T[],
  key: (group: T) => string | null,
): CountMap {
  return mergeCounts(groups.map((group) => ({ key: key(group), count: group._count._all })));
}

// Úkoly podle řešitele (hlavní i další řešitelé z balíku 05): řádky
// TaskAssignee (ASSIGNEE) + legacy úkoly bez řádků řešitelů podle
// assignedToId — úkol se tak nezapočítá dvakrát.
async function countTasksByAssignee(
  prisma: PrismaClient,
  user: CurrentUser,
  taskWhere: Prisma.TaskWhereInput,
  memberIds: string[],
): Promise<CountMap> {
  const visibleTaskWhere = andWhere<Prisma.TaskWhereInput>(
    { organizationId: user.organizationId },
    taskWhere,
    taskVisibilityWhere(user),
  );
  const [rows, legacy] = await Promise.all([
    prisma.taskAssignee.groupBy({
      by: ["userId"],
      where: {
        organizationId: user.organizationId,
        role: TaskAssigneeRole.ASSIGNEE,
        userId: { in: memberIds },
        task: { is: visibleTaskWhere },
      },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["assignedToId"],
      where: andWhere<Prisma.TaskWhereInput>(visibleTaskWhere, {
        assignedToId: { in: memberIds },
        assignees: { none: { role: TaskAssigneeRole.ASSIGNEE } },
      }),
      _count: { _all: true },
    }),
  ]);
  return mergeCounts(
    countMap(rows, (group) => group.userId),
    countMap(legacy, (group) => group.assignedToId),
  );
}

type TaskWindows = {
  open: Prisma.TaskWhereInput;
  overdue: Prisma.TaskWhereInput;
  upcoming: Prisma.TaskWhereInput;
  completed: Prisma.TaskWhereInput;
};

function taskWindows(now: Date, period: { fromMs: number; toExclusiveMs: number }): TaskWindows {
  const open: Prisma.TaskWhereInput = {
    archivedAt: null,
    status: { not: TaskStatus.COMPLETED },
  };
  return {
    open,
    overdue: { ...open, deadline: { lt: now } },
    upcoming: {
      ...open,
      deadline: { gte: now, lt: new Date(now.getTime() + UPCOMING_DAYS * DAY_MS) },
    },
    // Dokončené se mohou archivovat — archivace se tu neomezuje.
    completed: {
      status: TaskStatus.COMPLETED,
      completedAt: { gte: new Date(period.fromMs), lt: new Date(period.toExclusiveMs) },
    },
  };
}

type Access = {
  showHr: boolean;
  showDeadlines: boolean;
  hrNotice: boolean;
  scopeNotice: string | null;
  canManageUsers: boolean;
};

async function resolveAccess(user: CurrentUser): Promise<Access> {
  const [hrEnabled, deadlines] = await Promise.all([
    isModuleEnabled(user.organizationId, ModuleKey.HR_ATTENDANCE),
    canAccessModule(user, "module.deadlines"),
  ]);
  const manageHr = canManageHr(user);
  const workLogScope = scopeOf(user, "scope.workLogs");
  const taskScope = scopeOf(user, "scope.tasks");
  const narrowed: string[] = [];
  if (workLogScope !== "ALL") {
    narrowed.push(`Výkazy práce: ${permissionScopeLabels[workLogScope]}`);
  }
  if (taskScope !== "ALL") {
    narrowed.push(`Úkoly: ${permissionScopeLabels[taskScope]}`);
  }
  return {
    showHr: hrEnabled && manageHr,
    showDeadlines: deadlines,
    hrNotice: hrEnabled && !manageHr,
    scopeNotice: narrowed.length > 0 ? narrowed.join(", ") : null,
    canManageUsers: canManageUsers(user),
  };
}

async function loadMembers(prisma: PrismaClient, organizationId: string | null) {
  if (!organizationId) {
    return { members: [] as PerformanceMember[], teams: [] as Array<{ id: string; name: string }> };
  }
  const [memberships, teamMembers, teams] = await Promise.all([
    prisma.organizationMember.findMany({
      where: {
        organizationId,
        status: OrganizationMemberStatus.ACTIVE,
        user: { active: true },
      },
      select: { role: true, user: { select: { id: true, name: true } } },
    }),
    prisma.legalTeamMember.findMany({
      where: { organizationId, legalTeam: { archivedAt: null } },
      select: { userId: true, legalTeam: { select: { id: true, name: true } } },
    }),
    prisma.legalTeam.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const teamByUser = new Map(teamMembers.map((member) => [member.userId, member.legalTeam]));
  const members: PerformanceMember[] = memberships.map((membership) => {
    const team = teamByUser.get(membership.user.id) ?? null;
    return {
      userId: membership.user.id,
      name: membership.user.name,
      role: membership.role,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
    };
  });
  return { members, teams };
}

type MetricsInput = {
  prisma: PrismaClient;
  user: CurrentUser;
  memberIds: string[];
  period: { fromMs: number; toExclusiveMs: number };
  now: Date;
  access: Access;
};

// Společné agregace pro tabulku i detail osoby.
async function loadMetrics({ prisma, user, memberIds, period, now, access }: MetricsInput) {
  const windows = taskWindows(now, period);
  const todayMs = officeWorkDate(now).getTime();
  const from = new Date(period.fromMs);
  const toExclusive = new Date(period.toExclusiveMs);

  const [
    plans,
    hourGroups,
    openTasks,
    overdueTasks,
    upcomingTasks,
    completedTasks,
    deadlineGroups,
    employees,
    attendanceGroups,
    absences,
  ] = await Promise.all([
    prisma.userHoursPlan.findMany({
      where: { userId: { in: memberIds } },
      select: {
        userId: true,
        weeklyHoursTarget: true,
        monthlyHoursTarget: true,
        weeklyBillableHoursTarget: true,
        monthlyBillableHoursTarget: true,
      },
    }),
    prisma.workLog.groupBy({
      by: ["userId", "billingStatus", "approvalStatus"],
      where: andWhere<Prisma.WorkLogWhereInput>(
        {
          organizationId: user.organizationId,
          archivedAt: null,
          userId: { in: memberIds },
          workDate: { gte: from, lt: toExclusive },
        },
        workLogVisibilityWhere(user),
      ),
      _sum: { hours: true },
    }),
    countTasksByAssignee(prisma, user, windows.open, memberIds),
    countTasksByAssignee(prisma, user, windows.overdue, memberIds),
    countTasksByAssignee(prisma, user, windows.upcoming, memberIds),
    countTasksByAssignee(prisma, user, windows.completed, memberIds),
    access.showDeadlines
      ? prisma.deadline.groupBy({
          by: ["responsibleUserId"],
          where: andWhere<Prisma.DeadlineWhereInput>(
            {
              organizationId: user.organizationId,
              status: DeadlineStatus.OPEN,
              archivedAt: null,
              responsibleUserId: { in: memberIds },
              dueDate: {
                gte: new Date(todayMs),
                lt: new Date(todayMs + UPCOMING_DAYS * DAY_MS),
              },
            },
            deadlineVisibilityWhere(user),
          ),
          _count: { _all: true },
        })
      : Promise.resolve([]),
    access.showHr
      ? prisma.hrEmployee.findMany({
          where: andWhere<Prisma.HrEmployeeWhereInput>(
            { userId: { in: memberIds }, archivedAt: null },
            hrEmployeeVisibilityWhere(user),
          ),
          select: { id: true, userId: true },
        })
      : Promise.resolve([]),
    access.showHr
      ? prisma.hrAttendanceRecord.groupBy({
          by: ["employeeId"],
          where: andWhere<Prisma.HrAttendanceRecordWhereInput>(
            {
              employee: { is: { userId: { in: memberIds }, archivedAt: null } },
              workDate: { gte: from, lt: toExclusive },
              workedHours: { gt: 0 },
            },
            hrAttendanceVisibilityWhere(user),
          ),
          _sum: { workedHours: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    access.showHr
      ? prisma.hrAbsenceRequest.findMany({
          where: andWhere<Prisma.HrAbsenceRequestWhereInput>(
            {
              employee: { is: { userId: { in: memberIds }, archivedAt: null } },
              status: HrAbsenceStatus.APPROVED,
              startDate: { lt: toExclusive },
              endDate: { gte: from },
            },
            hrAbsenceVisibilityWhere(user),
          ),
          orderBy: { startDate: "asc" },
          select: {
            id: true,
            employeeId: true,
            type: true,
            startDate: true,
            endDate: true,
            halfDay: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const planByUser = new Map<string, HoursPlanTargets>(
    plans.map((plan) => [plan.userId, hoursPlanFromRecord(plan)]),
  );
  const hoursByUser = new Map<string, HoursGroup[]>();
  for (const group of hourGroups) {
    if (!group.userId) {
      continue;
    }
    const list = hoursByUser.get(group.userId) ?? [];
    list.push({
      billingStatus: group.billingStatus,
      approvalStatus: group.approvalStatus,
      hours: Number(group._sum.hours ?? 0),
    });
    hoursByUser.set(group.userId, list);
  }

  const hr = access.showHr
    ? {
        employeeByUser: new Map(
          employees
            .filter((employee) => employee.userId)
            .map((employee) => [employee.userId as string, employee.id]),
        ),
        attendance: new Map(
          attendanceGroups.map((group) => [
            group.employeeId,
            { days: group._count._all, hours: Number(group._sum.workedHours ?? 0) },
          ]),
        ),
        absences: absences.reduce((map, absence) => {
          const list = map.get(absence.employeeId) ?? [];
          list.push(absence);
          map.set(absence.employeeId, list);
          return map;
        }, new Map<string, AbsenceInput[]>()),
      }
    : null;

  return {
    planByUser,
    hoursByUser,
    openTasks,
    overdueTasks,
    upcomingTasks,
    completedTasks,
    upcomingDeadlines: countMap(deadlineGroups, (group) => group.responsibleUserId),
    hr,
    absences,
  };
}

export type PerformanceOverview = {
  period: PerformancePeriod;
  rows: PerformanceRow[];
  totals: PerformanceTotals;
  memberCount: number;
  teams: Array<{ id: string; name: string }>;
  roles: UserRole[];
  people: Array<{ id: string; name: string }>;
  showHr: boolean;
  showDeadlines: boolean;
  hrNotice: boolean;
  scopeNotice: string | null;
  canManageUsers: boolean;
};

export async function loadPerformanceOverview(
  user: CurrentUser,
  filters: PerformanceFilters,
  now: Date,
): Promise<PerformanceOverview> {
  const prisma = getPrisma();
  const period = resolvePerformancePeriod(filters.period, officeWorkDate(now));
  const [{ members, teams }, access] = await Promise.all([
    loadMembers(prisma, user.organizationId),
    resolveAccess(user),
  ]);
  const selected = filterPerformanceRows(members, filters);
  const memberIds = selected.map((member) => member.userId);

  const metrics =
    memberIds.length > 0
      ? await loadMetrics({ prisma, user, memberIds, period, now, access })
      : null;

  const rows = metrics
    ? sortPerformanceRows(
        buildPerformanceRows({
          members: selected,
          plans: metrics.planByUser,
          hours: metrics.hoursByUser,
          openTasks: metrics.openTasks,
          overdueTasks: metrics.overdueTasks,
          completedTasks: metrics.completedTasks,
          upcomingTasks: metrics.upcomingTasks,
          upcomingDeadlines: metrics.upcomingDeadlines,
          hr: metrics.hr,
          fromMs: period.fromMs,
          toExclusiveMs: period.toExclusiveMs,
        }),
        filters.sort,
        filters.dir,
      )
    : [];

  const collator = new Intl.Collator("cs");
  const roles = [...new Set(members.map((member) => member.role as UserRole))];
  return {
    period,
    rows,
    totals: performanceTotals(rows),
    memberCount: members.length,
    teams,
    roles,
    people: members
      .map((member) => ({ id: member.userId, name: member.name }))
      .sort((a, b) => collator.compare(a.name, b.name)),
    showHr: access.showHr,
    showDeadlines: access.showDeadlines,
    hrNotice: access.hrNotice,
    scopeNotice: access.scopeNotice,
    canManageUsers: access.canManageUsers,
  };
}

export type PersonPerformance = {
  period: PerformancePeriod;
  row: PerformanceRow;
  buckets: HoursKpiBucket[];
  bucketsByDay: boolean;
  periodTargets: { total: number | null; billable: number | null };
  openTasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    deadline: Date | null;
    project: { id: string; name: string } | null;
    case: { id: string; name: string; fileNumber: string | null } | null;
  }>;
  absences: Array<{
    id: string;
    type: string;
    startDate: Date;
    endDate: Date;
    halfDay: boolean;
  }>;
  showHr: boolean;
  showDeadlines: boolean;
  hrNotice: boolean;
  scopeNotice: string | null;
};

export const PERSON_TASK_LIMIT = 20;

// Detail osoby. Neaktivní nebo cizí uživatel → null (stránka vrátí notFound).
export async function loadPersonPerformance(
  user: CurrentUser,
  userId: string,
  filters: PerformanceFilters,
  now: Date,
): Promise<PersonPerformance | null> {
  const prisma = getPrisma();
  const period = resolvePerformancePeriod(filters.period, officeWorkDate(now));
  const [{ members }, access] = await Promise.all([
    loadMembers(prisma, user.organizationId),
    resolveAccess(user),
  ]);
  const member = members.find((item) => item.userId === userId);
  if (!member) {
    return null;
  }
  const from = new Date(period.fromMs);
  const toExclusive = new Date(period.toExclusiveMs);

  const [metrics, dailyGroups, openTasks] = await Promise.all([
    loadMetrics({ prisma, user, memberIds: [userId], period, now, access }),
    prisma.workLog.groupBy({
      by: ["workDate", "billingStatus", "approvalStatus"],
      where: andWhere<Prisma.WorkLogWhereInput>(
        {
          organizationId: user.organizationId,
          archivedAt: null,
          userId,
          workDate: { gte: from, lt: toExclusive },
        },
        workLogVisibilityWhere(user),
      ),
      _sum: { hours: true },
    }),
    prisma.task.findMany({
      where: andWhere<Prisma.TaskWhereInput>(
        {
          organizationId: user.organizationId,
          archivedAt: null,
          status: { not: TaskStatus.COMPLETED },
        },
        taskAssigneeWhere(userId),
        taskVisibilityWhere(user),
      ),
      orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: PERSON_TASK_LIMIT,
      select: {
        id: true,
        title: true,
        status: true,
        deadline: true,
        project: { select: { id: true, name: true } },
        case: { select: { id: true, name: true, fileNumber: true } },
      },
    }),
  ]);

  const [row] = buildPerformanceRows({
    members: [member],
    plans: metrics.planByUser,
    hours: metrics.hoursByUser,
    openTasks: metrics.openTasks,
    overdueTasks: metrics.overdueTasks,
    completedTasks: metrics.completedTasks,
    upcomingTasks: metrics.upcomingTasks,
    upcomingDeadlines: metrics.upcomingDeadlines,
    hr: metrics.hr,
    fromMs: period.fromMs,
    toExclusiveMs: period.toExclusiveMs,
  });

  const plan = metrics.planByUser.get(userId) ?? hoursPlanFromRecord(null);
  const entries = dailyGroups.map((group) => ({
    workDate: group.workDate,
    hours: Number(group._sum.hours ?? 0),
    billable: isBillableKpiHours(group.billingStatus, group.approvalStatus),
  }));
  const bucketsByDay = period.toExclusiveMs - period.fromMs <= 14 * DAY_MS;
  const prefer = defaultTargetPreference(period.fromMs, period.toExclusiveMs);
  const todayMs = officeWorkDate(now).getTime();
  const buckets = bucketsByDay
    ? dailyKpiBuckets(period.fromMs, period.toExclusiveMs, entries, plan, { todayMs, prefer })
    : weeklyKpiBuckets(period.fromMs, period.toExclusiveMs, entries, plan, { todayMs, prefer });

  return {
    period,
    row,
    buckets,
    bucketsByDay,
    periodTargets: periodTargets(plan, period.fromMs, period.toExclusiveMs),
    openTasks,
    absences: metrics.absences,
    showHr: access.showHr,
    showDeadlines: access.showDeadlines,
    hrNotice: access.hrNotice,
    scopeNotice: access.scopeNotice,
  };
}
