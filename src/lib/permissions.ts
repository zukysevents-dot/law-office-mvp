import type { Prisma } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";

type PermissionUser = {
  id: string;
  role: UserRole;
  // Present on users resolved via getCurrentUser(); absent when only a role is
  // passed. Visibility helpers DENY when it's missing (fail closed).
  organizationId?: string | null;
  isPlatformAdmin?: boolean;
};

type PermissionInput = PermissionUser | UserRole | null | undefined;

type RecordType =
  | "Task"
  | "Project"
  | "Case"
  | "WorkLog"
  | "Reference"
  | "Subject";

type AssignmentRecord = {
  createdById?: string | null;
  assignedToId?: string | null;
  responsibleUserId?: string | null;
};

type ProjectRecord = {
  responsibleUserId?: string | null;
};

type CaseRecord = {
  responsibleUserId?: string | null;
  project?: ProjectRecord | null;
};

type WorkLogRecord = {
  userId?: string | null;
};

type OrgScoped = { organizationId?: string | null };

type ViewRecord =
  | (AssignmentRecord & {
      project?: ProjectRecord | null;
      case?: CaseRecord | null;
    })
  | ProjectRecord
  | CaseRecord
  | WorkLogRecord
  | Record<string, unknown>
  | null
  | undefined;

function roleOf(user: PermissionInput) {
  return typeof user === "string" ? user : user?.role;
}

function userIdOf(user: PermissionInput) {
  return typeof user === "string" ? null : user?.id ?? null;
}

function orgIdOf(user: PermissionInput): string | null {
  return typeof user === "string" ? null : user?.organizationId ?? null;
}

// Org filter for a user's visibility query, or null when they have no org
// (caller should then deny). Prepended to every *VisibilityWhere via andWhere.
function orgClause(user: PermissionInput): { organizationId: string } | null {
  const orgId = orgIdOf(user);
  return orgId ? { organizationId: orgId } : null;
}

// True when the record carries an organizationId that differs from the user's.
// Records without an org (UI prefs, role-only callers) are not blocked here.
function orgMismatch(user: PermissionInput, record: ViewRecord): boolean {
  const recordOrg = (record as OrgScoped | null | undefined)?.organizationId;
  return Boolean(recordOrg) && recordOrg !== orgIdOf(user);
}

function denyWhere<T extends object>() {
  return { id: "__role_denied__" } as T;
}

function directTaskUserWhere(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { createdById: userId },
      { assignedToId: userId },
      { responsibleUserId: userId },
    ],
  };
}

function hasDirectTaskAccess(record: AssignmentRecord, userId: string) {
  return (
    record.createdById === userId ||
    record.assignedToId === userId ||
    record.responsibleUserId === userId
  );
}

export function andWhere<T extends object>(
  ...clauses: Array<object | null | undefined>
): T {
  const active = clauses.filter(
    (clause): clause is object => {
      if (!clause) {
        return false;
      }

      return Object.keys(clause).length > 0;
    },
  );

  if (active.length === 0) {
    return {} as T;
  }

  if (active.length === 1) {
    return active[0] as T;
  }

  return { AND: active } as T;
}

export function isAdmin(user: PermissionInput) {
  return roleOf(user) === UserRole.ADMIN;
}

export function isPartner(user: PermissionInput) {
  return roleOf(user) === UserRole.PARTNER;
}

export function canViewAllLegalData(user: PermissionInput) {
  return isAdmin(user) || isPartner(user);
}

export function assertCanArchiveRecords(user: PermissionInput) {
  if (!canViewAllLegalData(user)) {
    throw new Error("Nemáte oprávnění archivovat ani obnovovat záznamy.");
  }
}

export function assertCanManageUsers(user: PermissionInput) {
  if (!canViewAllLegalData(user)) {
    throw new Error("Nemáte oprávnění spravovat uživatele.");
  }
}

export function assertCanApproveBilling(user: PermissionInput) {
  if (!canViewAllLegalData(user)) {
    throw new Error("Nemáte oprávnění schvalovat fakturační podklady.");
  }
}

// Platform/developer super-admin over all organizations (the /admin panel).
export function assertPlatformAdmin(user: PermissionInput) {
  const ok = typeof user === "string" ? false : Boolean(user?.isPlatformAdmin);
  if (!ok) {
    throw new Error("Přístup pouze pro správce platformy.");
  }
}

// Authorizes administering a SPECIFIC org: platform admin (any org) OR an
// ADMIN/PARTNER acting within their own org. Used by the shared org actions so
// /admin and /settings/organization can reuse them safely.
export function assertCanAdministerOrg(
  user: PermissionInput,
  organizationId: string,
) {
  if (typeof user !== "string" && user?.isPlatformAdmin) {
    return;
  }
  if (canViewAllLegalData(user) && orgIdOf(user) === organizationId) {
    return;
  }
  throw new Error("Nemáte oprávnění spravovat tuto kancelář.");
}

// Throws if the record belongs to a different organization than the user. Used
// by archive/restore actions (which gate on role, not on canEditRecord).
export function assertSameOrg(user: PermissionInput, record: ViewRecord) {
  if (orgMismatch(user, record)) {
    throw new Error("Záznam patří jiné kanceláři.");
  }
}

export function taskVisibilityWhere(user: PermissionInput): Prisma.TaskWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.TaskWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.TaskWhereInput>();
  }

  const directWhere = directTaskUserWhere(userId);

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        directWhere,
        { project: { is: { responsibleUserId: userId } } },
        { case: { is: { responsibleUserId: userId } } },
        {
          case: {
            is: { project: { is: { responsibleUserId: userId } } },
          },
        },
      ],
    });
  }

  if (role === UserRole.TRAINEE || role === UserRole.INTERN) {
    return andWhere(org, directWhere);
  }

  return denyWhere<Prisma.TaskWhereInput>();
}

export function projectVisibilityWhere(
  user: PermissionInput,
): Prisma.ProjectWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.ProjectWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.ProjectWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        { responsibleUserId: userId },
        { cases: { some: { responsibleUserId: userId } } },
        { tasks: { some: directTaskUserWhere(userId) } },
        { workLogs: { some: { userId } } },
      ],
    });
  }

  if (role === UserRole.TRAINEE) {
    return andWhere(org, {
      OR: [
        { tasks: { some: directTaskUserWhere(userId) } },
        { workLogs: { some: { userId } } },
      ],
    });
  }

  return denyWhere<Prisma.ProjectWhereInput>();
}

export function caseVisibilityWhere(user: PermissionInput): Prisma.CaseWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.CaseWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.CaseWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        { responsibleUserId: userId },
        { project: { is: { responsibleUserId: userId } } },
        { tasks: { some: directTaskUserWhere(userId) } },
        { workLogs: { some: { userId } } },
      ],
    });
  }

  if (role === UserRole.TRAINEE) {
    return andWhere(org, {
      OR: [
        { tasks: { some: directTaskUserWhere(userId) } },
        { workLogs: { some: { userId } } },
      ],
    });
  }

  return denyWhere<Prisma.CaseWhereInput>();
}

export function workLogVisibilityWhere(
  user: PermissionInput,
): Prisma.WorkLogWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.WorkLogWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.WorkLogWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        { userId },
        { task: { is: directTaskUserWhere(userId) } },
        { project: { is: { responsibleUserId: userId } } },
        { case: { is: { responsibleUserId: userId } } },
        {
          case: {
            is: { project: { is: { responsibleUserId: userId } } },
          },
        },
      ],
    });
  }

  if (role === UserRole.TRAINEE || role === UserRole.INTERN) {
    return andWhere(org, { userId });
  }

  return denyWhere<Prisma.WorkLogWhereInput>();
}

export function invoiceVisibilityWhere(
  user: PermissionInput,
): Prisma.InvoiceWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.InvoiceWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.InvoiceWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        { createdById: userId },
        { issuedById: userId },
        { project: { is: { responsibleUserId: userId } } },
        { case: { is: { responsibleUserId: userId } } },
        { case: { is: { project: { is: { responsibleUserId: userId } } } } },
      ],
    });
  }

  // TRAINEE/INTERN don't manage invoices; only ones they created (≈ none).
  return andWhere(org, { createdById: userId });
}

// Who may create/issue/cancel client invoices: ADMIN, PARTNER, LAWYER.
// TRAINEE/INTERN are excluded. Org isolation is enforced separately per record.
export function assertCanManageInvoices(user: PermissionInput) {
  const ok = canViewAllLegalData(user) || roleOf(user) === UserRole.LAWYER;
  if (!ok) {
    throw new Error("Nemáte oprávnění spravovat faktury.");
  }
}

export function referenceVisibilityWhere(
  user: PermissionInput,
): Prisma.ReferenceWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.ReferenceWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.ReferenceWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        { project: { is: { responsibleUserId: userId } } },
        { case: { is: { responsibleUserId: userId } } },
        {
          case: {
            is: { project: { is: { responsibleUserId: userId } } },
          },
        },
        { project: { is: { tasks: { some: directTaskUserWhere(userId) } } } },
        { case: { is: { tasks: { some: directTaskUserWhere(userId) } } } },
        { project: { is: { workLogs: { some: { userId } } } } },
        { case: { is: { workLogs: { some: { userId } } } } },
      ],
    });
  }

  return denyWhere<Prisma.ReferenceWhereInput>();
}

export function subjectVisibilityWhere(
  user: PermissionInput,
): Prisma.SubjectWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.SubjectWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.SubjectWhereInput>();
  }

  if (role === UserRole.INTERN) {
    return andWhere(org, { workLogs: { some: { userId } } });
  }

  const projectWhere = projectVisibilityWhere(user);
  const caseWhere = caseVisibilityWhere(user);

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        { mainProjects: { some: projectWhere } },
        { relations: { some: { project: { is: projectWhere } } } },
        { relations: { some: { case: { is: caseWhere } } } },
        { workLogs: { some: workLogVisibilityWhere(user) } },
        { references: { some: referenceVisibilityWhere(user) } },
      ],
    });
  }

  if (role === UserRole.TRAINEE) {
    return andWhere(org, {
      OR: [
        { mainProjects: { some: projectWhere } },
        { relations: { some: { project: { is: projectWhere } } } },
        { relations: { some: { case: { is: caseWhere } } } },
        { workLogs: { some: { userId } } },
      ],
    });
  }

  return denyWhere<Prisma.SubjectWhereInput>();
}

export function canViewRecord(
  user: PermissionInput,
  type: RecordType,
  record: ViewRecord,
) {
  if (!record) {
    return false;
  }

  // Org isolation first — applies to every role, including ADMIN/PARTNER.
  if (orgMismatch(user, record)) {
    return false;
  }

  if (canViewAllLegalData(user)) {
    return true;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return false;
  }

  if (type === "Task") {
    const task = record as AssignmentRecord & {
      project?: ProjectRecord | null;
      case?: CaseRecord | null;
    };

    return (
      hasDirectTaskAccess(task, userId) ||
      (role === UserRole.LAWYER &&
        (task.project?.responsibleUserId === userId ||
          task.case?.responsibleUserId === userId ||
          task.case?.project?.responsibleUserId === userId))
    );
  }

  if (type === "Project") {
    const project = record as ProjectRecord;
    return role === UserRole.LAWYER && project.responsibleUserId === userId;
  }

  if (type === "Case") {
    const legalCase = record as CaseRecord;
    return (
      role === UserRole.LAWYER &&
      (legalCase.responsibleUserId === userId ||
        legalCase.project?.responsibleUserId === userId)
    );
  }

  if (type === "WorkLog") {
    const workLog = record as WorkLogRecord;
    return workLog.userId === userId;
  }

  return false;
}

export function canEditRecord(
  user: PermissionInput,
  type: RecordType,
  record: ViewRecord,
) {
  if (!record) {
    return false;
  }

  // Org isolation first — a record from another org is never editable, even by
  // ADMIN/PARTNER (who otherwise see everything in their own org).
  if (orgMismatch(user, record)) {
    return false;
  }

  if (canViewAllLegalData(user)) {
    return true;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return false;
  }

  if (type === "Task") {
    return hasDirectTaskAccess(record as AssignmentRecord, userId);
  }

  if (type === "Project") {
    return (
      role === UserRole.LAWYER &&
      (record as ProjectRecord).responsibleUserId === userId
    );
  }

  if (type === "Case") {
    return (
      role === UserRole.LAWYER &&
      (record as CaseRecord).responsibleUserId === userId
    );
  }

  if (type === "WorkLog") {
    return (record as WorkLogRecord).userId === userId;
  }

  return false;
}

export function assertCanEditRecord(
  user: PermissionInput,
  type: RecordType,
  record: ViewRecord,
) {
  if (!canEditRecord(user, type, record)) {
    throw new Error("Nemáte oprávnění upravit tento záznam.");
  }
}
