import type { Prisma } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";

type PermissionUser = {
  id: string;
  role: UserRole;
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

export function canArchiveRecords(user: PermissionInput) {
  return canViewAllLegalData(user);
}

export function assertCanArchiveRecords(user: PermissionInput) {
  if (!canArchiveRecords(user)) {
    throw new Error("Nemáte oprávnění archivovat ani obnovovat záznamy.");
  }
}

export function canViewAuditLog(user: PermissionInput) {
  return canViewAllLegalData(user);
}

export function assertCanViewAuditLog(user: PermissionInput) {
  if (!canViewAuditLog(user)) {
    throw new Error("Nemáte oprávnění zobrazit audit log.");
  }
}

export function canManageUsers(user: PermissionInput) {
  return canViewAllLegalData(user);
}

export function assertCanManageUsers(user: PermissionInput) {
  if (!canManageUsers(user)) {
    throw new Error("Nemáte oprávnění spravovat uživatele.");
  }
}

export function canApproveBilling(user: PermissionInput) {
  return canViewAllLegalData(user);
}

export function assertCanApproveBilling(user: PermissionInput) {
  if (!canApproveBilling(user)) {
    throw new Error("Nemáte oprávnění schvalovat fakturační podklady.");
  }
}

export function taskVisibilityWhere(user: PermissionInput): Prisma.TaskWhereInput {
  if (canViewAllLegalData(user)) {
    return {};
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.TaskWhereInput>();
  }

  const directWhere = directTaskUserWhere(userId);

  if (role === UserRole.LAWYER) {
    return {
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
    };
  }

  if (role === UserRole.TRAINEE || role === UserRole.INTERN) {
    return directWhere;
  }

  return denyWhere<Prisma.TaskWhereInput>();
}

export function projectVisibilityWhere(
  user: PermissionInput,
): Prisma.ProjectWhereInput {
  if (canViewAllLegalData(user)) {
    return {};
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.ProjectWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return {
      OR: [
        { responsibleUserId: userId },
        { cases: { some: { responsibleUserId: userId } } },
        { tasks: { some: directTaskUserWhere(userId) } },
        { workLogs: { some: { userId } } },
      ],
    };
  }

  if (role === UserRole.TRAINEE) {
    return {
      OR: [
        { tasks: { some: directTaskUserWhere(userId) } },
        { workLogs: { some: { userId } } },
      ],
    };
  }

  return denyWhere<Prisma.ProjectWhereInput>();
}

export function caseVisibilityWhere(user: PermissionInput): Prisma.CaseWhereInput {
  if (canViewAllLegalData(user)) {
    return {};
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.CaseWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return {
      OR: [
        { responsibleUserId: userId },
        { project: { is: { responsibleUserId: userId } } },
        { tasks: { some: directTaskUserWhere(userId) } },
        { workLogs: { some: { userId } } },
      ],
    };
  }

  if (role === UserRole.TRAINEE) {
    return {
      OR: [
        { tasks: { some: directTaskUserWhere(userId) } },
        { workLogs: { some: { userId } } },
      ],
    };
  }

  return denyWhere<Prisma.CaseWhereInput>();
}

export function workLogVisibilityWhere(
  user: PermissionInput,
): Prisma.WorkLogWhereInput {
  if (canViewAllLegalData(user)) {
    return {};
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.WorkLogWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return {
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
    };
  }

  if (role === UserRole.TRAINEE || role === UserRole.INTERN) {
    return { userId };
  }

  return denyWhere<Prisma.WorkLogWhereInput>();
}

export function referenceVisibilityWhere(
  user: PermissionInput,
): Prisma.ReferenceWhereInput {
  if (canViewAllLegalData(user)) {
    return {};
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.ReferenceWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return {
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
    };
  }

  return denyWhere<Prisma.ReferenceWhereInput>();
}

export function subjectVisibilityWhere(
  user: PermissionInput,
): Prisma.SubjectWhereInput {
  if (canViewAllLegalData(user)) {
    return {};
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.SubjectWhereInput>();
  }

  if (role === UserRole.INTERN) {
    return { workLogs: { some: { userId } } };
  }

  const projectWhere = projectVisibilityWhere(user);
  const caseWhere = caseVisibilityWhere(user);

  if (role === UserRole.LAWYER) {
    return {
      OR: [
        { mainProjects: { some: projectWhere } },
        { relations: { some: { project: { is: projectWhere } } } },
        { relations: { some: { case: { is: caseWhere } } } },
        { workLogs: { some: workLogVisibilityWhere(user) } },
        { references: { some: referenceVisibilityWhere(user) } },
      ],
    };
  }

  if (role === UserRole.TRAINEE) {
    return {
      OR: [
        { mainProjects: { some: projectWhere } },
        { relations: { some: { project: { is: projectWhere } } } },
        { relations: { some: { case: { is: caseWhere } } } },
        { workLogs: { some: { userId } } },
      ],
    };
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
