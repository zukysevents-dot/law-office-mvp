import "server-only";

import type { ApprovalStatus, BillingStatus } from "@/generated/prisma/enums";
import type { getCurrentUser } from "@/lib/auth";
import {
  APPROVAL_ROW_LIMIT,
  approvalFilterWhere,
  approvalScopeWhere,
  type ApprovalAccess,
  type ApprovalFilters,
} from "@/lib/billing-approvals";
import { billingWorkLogInclude } from "@/lib/billing";
import { formatCaseLabel, formatDateUtc } from "@/lib/format";
import { getOrgUserOptions } from "@/lib/org-users";
import { andWhere, canApproveWorkLogs } from "@/lib/permissions";
import type { getPrisma } from "@/lib/prisma";

type Prisma = ReturnType<typeof getPrisma>;
type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

/**
 * Who may decide approval items: the function „Schvaluje výkazy celé
 * kanceláře“ (function.approveWorkLogs) everything, other users only the
 * clients they are assigned to as billing approvers (SubjectBillingApprover).
 */
export async function getApprovalAccess(
  prisma: Prisma,
  user: CurrentUser,
): Promise<ApprovalAccess> {
  const canApproveAll = canApproveWorkLogs(user);
  if (canApproveAll) {
    return { canApproveAll: true, canApprove: true };
  }
  const assignments = await prisma.subjectBillingApprover.count({
    where: { organizationId: user.organizationId, userId: user.id },
  });
  return { canApproveAll: false, canApprove: assignments > 0 };
}

export type ApprovalQueueRow = {
  id: string;
  workDate: string;
  /** "14. 02. 2031" — formatted on the server (work dates are UTC days). */
  workDateLabel: string;
  subjectName: string | null;
  projectName: string | null;
  caseLabel: string | null;
  taskTitle: string | null;
  userId: string | null;
  userName: string | null;
  hours: number;
  hourlyRate: number | null;
  description: string | null;
  billingStatus: BillingStatus;
  approvalStatus: ApprovalStatus;
};

export type ApprovalQueueData = {
  rows: ApprovalQueueRow[];
  totals: { count: number; hours: number };
  capped: boolean;
  access: ApprovalAccess;
  users: Array<{ id: string; name: string }>;
  options: {
    subjects: Array<{ id: string; name: string }>;
    projects: Array<{ id: string; name: string; mainSubjectId: string }>;
    cases: Array<{
      id: string;
      name: string;
      projectId: string;
      projectName: string;
    }>;
    users: Array<{ id: string; name: string }>;
  };
};

export async function loadApprovalQueue(
  prisma: Prisma,
  user: CurrentUser,
  filters: ApprovalFilters,
): Promise<ApprovalQueueData> {
  const access = await getApprovalAccess(prisma, user);
  const scope = approvalScopeWhere(user, access);
  const where = andWhere(scope, approvalFilterWhere(filters));

  const [rows, aggregate, groups, orgUsers] = await Promise.all([
    prisma.workLog.findMany({
      where,
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      include: { ...billingWorkLogInclude, task: { select: { title: true } } },
      take: APPROVAL_ROW_LIMIT,
    }),
    prisma.workLog.aggregate({
      where,
      _count: { _all: true },
      _sum: { hours: true },
    }),
    // Filter options = only what actually waits in this user's queue, so an
    // approver sees exactly the clients they may approve (even when the
    // matter itself isn't in their normal visibility).
    prisma.workLog.groupBy({
      by: ["subjectId", "projectId", "caseId", "userId"],
      where: scope,
    }),
    getOrgUserOptions(user),
  ]);

  const caseIds = new Set<string>();
  const projectIds = new Set<string>();
  const subjectIds = new Set<string>();
  const userIds = new Set<string>();
  for (const group of groups) {
    if (group.caseId) caseIds.add(group.caseId);
    if (group.projectId) projectIds.add(group.projectId);
    if (group.subjectId) subjectIds.add(group.subjectId);
    if (group.userId) userIds.add(group.userId);
  }

  const cases = caseIds.size
    ? await prisma.case.findMany({
        where: { id: { in: [...caseIds] }, organizationId: user.organizationId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          projectId: true,
          project: { select: { name: true } },
        },
      })
    : [];
  for (const legalCase of cases) {
    projectIds.add(legalCase.projectId);
  }
  const projects = projectIds.size
    ? await prisma.project.findMany({
        where: {
          id: { in: [...projectIds] },
          organizationId: user.organizationId,
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, mainSubjectId: true },
      })
    : [];
  for (const project of projects) {
    subjectIds.add(project.mainSubjectId);
  }
  const subjects = subjectIds.size
    ? await prisma.subject.findMany({
        where: {
          id: { in: [...subjectIds] },
          organizationId: user.organizationId,
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, ico: true },
      })
    : [];

  return {
    rows: rows.map((row) => ({
      id: row.id,
      workDate: row.workDate.toISOString(),
      workDateLabel: formatDateUtc(row.workDate),
      subjectName: row.subject?.name ?? null,
      projectName: row.project?.name ?? null,
      caseLabel: row.case ? formatCaseLabel(row.case) : null,
      taskTitle: row.task?.title ?? null,
      userId: row.userId,
      userName: row.user?.name ?? null,
      hours: Number(row.hours),
      hourlyRate: row.hourlyRate != null ? Number(row.hourlyRate) : null,
      description: row.description,
      billingStatus: row.billingStatus,
      approvalStatus: row.approvalStatus,
    })),
    totals: {
      count: aggregate._count._all,
      hours: Number(aggregate._sum.hours ?? 0),
    },
    capped: aggregate._count._all > rows.length,
    access,
    users: orgUsers,
    options: {
      subjects: subjects.map((subject) => ({
        id: subject.id,
        name: subject.ico ? `${subject.name}, IČO ${subject.ico}` : subject.name,
      })),
      projects,
      cases: cases.map((legalCase) => ({
        id: legalCase.id,
        name: legalCase.name,
        projectId: legalCase.projectId,
        projectName: legalCase.project.name,
      })),
      users: orgUsers.filter((option) => userIds.has(option.id)),
    },
  };
}

/** Pending items in the user's approval scope (header badge on /work-logs). */
export async function countApprovalQueue(
  prisma: Prisma,
  user: CurrentUser,
  access: ApprovalAccess,
): Promise<number> {
  return prisma.workLog.count({ where: approvalScopeWhere(user, access) });
}
