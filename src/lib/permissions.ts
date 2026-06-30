import type { Prisma } from "@/generated/prisma/client";
import { Capability, UserRole } from "@/generated/prisma/enums";

type PermissionUser = {
  id: string;
  role: UserRole;
  // Present on users resolved via getCurrentUser(); absent when only a role is
  // passed. Visibility helpers DENY when it's missing (fail closed).
  organizationId?: string | null;
  isPlatformAdmin?: boolean;
  // Per-user granty nad rámec role (allow-only). Chybí u role-only callerů →
  // hasCapability fail-closed na false → spadne se na role baseline.
  capabilities?: Capability[];
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

type AssigneeRef = { userId: string };

type ProjectRecord = {
  responsibleUserId?: string | null;
  assignees?: AssigneeRef[] | null;
};

type CaseRecord = {
  responsibleUserId?: string | null;
  project?: ProjectRecord | null;
  assignees?: AssigneeRef[] | null;
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

// True když uživatel nese daný per-user grant. Fail-closed: string/role-only/
// null user nebo chybějící pole → false (can* helpery pak spadnou na role
// baseline). Grant může jen ROZŠÍŘIT, nikdy nezužuje to, co dává role.
export function hasCapability(user: PermissionInput, capability: Capability) {
  if (!user || typeof user === "string") {
    return false;
  }
  return (
    Array.isArray(user.capabilities) && user.capabilities.includes(capability)
  );
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

// True when the user is one of the record's assignees (additional řešitelé).
function isAssigneeOf(
  assignees: AssigneeRef[] | null | undefined,
  userId: string,
) {
  return Array.isArray(assignees) && assignees.some((a) => a.userId === userId);
}

// Prisma `where` fragments matching a project/case where the user is an
// assignee. Mirror the responsibleUserId clauses everywhere those appear so an
// assignee gets exactly the visibility a responsible person would.
function projectAssigneeWhere(userId: string): Prisma.ProjectWhereInput {
  return { assignees: { some: { userId } } };
}

function caseAssigneeWhere(userId: string): Prisma.CaseWhereInput {
  return { assignees: { some: { userId } } };
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

// Hourly rates / billed amounts are partner-level information. Default: only
// ADMIN/PARTNER see the rate column. Admin can additionally grant VIEW_RATES to
// a specific user (revize ř.35/62) — granted users then see rates everywhere
// canViewRates is checked (work-logs server-side + page-level restrictTableView).
export function canViewRates(user: PermissionInput) {
  return canViewAllLegalData(user) || hasCapability(user, Capability.VIEW_RATES);
}

// Who may mark work directly billable. Junior roles (trainee, intern) only get
// "ke schválení" / "interní" — a partner/advokát decides what gets billed.
export function canSetBillableStatus(user: PermissionInput) {
  return canViewAllLegalData(user) || roleOf(user) === UserRole.LAWYER;
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
        // Assignee mirror: tasks of a project/case the user is assigned to.
        { project: { is: projectAssigneeWhere(userId) } },
        { case: { is: caseAssigneeWhere(userId) } },
        {
          case: {
            is: { project: { is: projectAssigneeWhere(userId) } },
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
        { assignees: { some: { userId } } },
        { cases: { some: { responsibleUserId: userId } } },
        { cases: { some: { assignees: { some: { userId } } } } },
        { tasks: { some: directTaskUserWhere(userId) } },
        { workLogs: { some: { userId } } },
      ],
    });
  }

  if (role === UserRole.TRAINEE) {
    return andWhere(org, {
      OR: [
        // Project view mirrors LAWYER assignee paths so an assigned trainee
        // sees the whole project (and projects of cases they're assigned to).
        { assignees: { some: { userId } } },
        { cases: { some: { assignees: { some: { userId } } } } },
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
        { assignees: { some: { userId } } },
        { project: { is: { responsibleUserId: userId } } },
        { project: { is: projectAssigneeWhere(userId) } },
        { tasks: { some: directTaskUserWhere(userId) } },
        { workLogs: { some: { userId } } },
      ],
    });
  }

  if (role === UserRole.TRAINEE) {
    return andWhere(org, {
      OR: [
        // Case view mirrors LAWYER assignee paths: assigned to the case, or to
        // its project (project assignee sees the project's cases).
        { assignees: { some: { userId } } },
        { project: { is: projectAssigneeWhere(userId) } },
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
        // Assignee mirror: work-logs on a project/case the user is assigned to.
        { project: { is: projectAssigneeWhere(userId) } },
        { case: { is: caseAssigneeWhere(userId) } },
        {
          case: {
            is: { project: { is: projectAssigneeWhere(userId) } },
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
        // Assignee mirror: invoices on a project/case the user is assigned to.
        { project: { is: projectAssigneeWhere(userId) } },
        { case: { is: caseAssigneeWhere(userId) } },
        { case: { is: { project: { is: projectAssigneeWhere(userId) } } } },
      ],
    });
  }

  // TRAINEE/INTERN don't manage invoices; only ones they created (≈ none).
  return andWhere(org, { createdById: userId });
}

// Who may create/issue/cancel client invoices, record payments, send reminders
// and manage retainers. Default: ADMIN/PARTNER only (revize ř.77 — fakturace jen
// pro vedení a vybrané osoby). Other users (incl. LAWYER) need an explicit
// MANAGE_INVOICES grant — existing active lawyers were granted it by the
// data-migration, so admin can revoke from those who shouldn't invoice.
export function canManageInvoices(user: PermissionInput) {
  return (
    canViewAllLegalData(user) || hasCapability(user, Capability.MANAGE_INVOICES)
  );
}

export function assertCanManageInvoices(user: PermissionInput) {
  if (!canManageInvoices(user)) {
    throw new Error("Nemáte oprávnění spravovat faktury.");
  }
}

// Visibility for data messages (F2). Data-box content is sensitive: ADMIN/PARTNER
// see all org messages; a LAWYER sees only ones they recorded or that are
// assigned to a case they're responsible for. Unassigned messages (no case)
// therefore stay visible only to ADMIN/PARTNER and their creator. TRAINEE/INTERN
// see only what they created (default-deny on sensitive DS data).
export function dataMessageVisibilityWhere(
  user: PermissionInput,
): Prisma.DataMessageWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.DataMessageWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.DataMessageWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        { createdById: userId },
        { case: { is: { responsibleUserId: userId } } },
        { case: { is: { project: { is: { responsibleUserId: userId } } } } },
        // Assignee mirror: data messages on a case the user is assigned to.
        { case: { is: caseAssigneeWhere(userId) } },
        { case: { is: { project: { is: projectAssigneeWhere(userId) } } } },
      ],
    });
  }

  return andWhere(org, { createdById: userId });
}

// Who may record/assign/send data messages: ADMIN, PARTNER, LAWYER. (Configuring
// a DataBoxAccount is stricter — ADMIN/PARTNER via assertCanAdministerOrg.)
export function assertCanManageDataBoxes(user: PermissionInput) {
  const ok = canViewAllLegalData(user) || roleOf(user) === UserRole.LAWYER;
  if (!ok) {
    throw new Error("Nemáte oprávnění pracovat s datovými schránkami.");
  }
}

// AML/KYC data is compliance-sensitive (identity documents, PEP/sanctions) —
// restricted to ADMIN/PARTNER for both viewing and management.
export function canManageAml(user: PermissionInput): boolean {
  return canViewAllLegalData(user);
}

export function assertCanManageAml(user: PermissionInput) {
  if (!canManageAml(user)) {
    throw new Error("Nemáte oprávnění k AML/KYC údajům.");
  }
}

// Who may create/edit/complete deadlines and court hearings: ADMIN, PARTNER,
// LAWYER. Closing a procedural deadline is a liability act (a missed deadline is
// the lawyer's liability), so TRAINEE/INTERN are excluded from managing them.
export function canManageDeadlines(user: PermissionInput): boolean {
  return canViewAllLegalData(user) || roleOf(user) === UserRole.LAWYER;
}

export function assertCanManageDeadlines(user: PermissionInput) {
  if (!canManageDeadlines(user)) {
    throw new Error("Nemáte oprávnění spravovat lhůty.");
  }
}

// Visibility for deadlines (F4). Deadlines are case-bound, so visibility derives
// from the case (like data messages): ADMIN/PARTNER see all org deadlines; a
// LAWYER sees ones they own (responsible/created) or on a case they're
// responsible for; TRAINEE/INTERN see only ones they own. Fail-closed without org.
export function deadlineVisibilityWhere(
  user: PermissionInput,
): Prisma.DeadlineWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.DeadlineWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.DeadlineWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        { responsibleUserId: userId },
        { createdById: userId },
        { case: { is: { responsibleUserId: userId } } },
        { case: { is: { project: { is: { responsibleUserId: userId } } } } },
        // Assignee mirror: deadlines on a case the user is assigned to.
        { case: { is: caseAssigneeWhere(userId) } },
        { case: { is: { project: { is: projectAssigneeWhere(userId) } } } },
      ],
    });
  }

  return andWhere(org, {
    OR: [{ responsibleUserId: userId }, { createdById: userId }],
  });
}

// Who may create/edit/version documents: ADMIN, PARTNER, LAWYER. Documents are
// case/subject-bound work artifacts under attorney confidentiality, so junior
// roles (TRAINEE/INTERN) don't author or version them in the MVP.
export function canManageDocuments(user: PermissionInput): boolean {
  return canViewAllLegalData(user) || roleOf(user) === UserRole.LAWYER;
}

export function assertCanManageDocuments(user: PermissionInput) {
  if (!canManageDocuments(user)) {
    throw new Error("Nemáte oprávnění spravovat dokumenty.");
  }
}

// Templates are an office-wide asset (they change generation for everyone), so
// managing them is restricted to ADMIN/PARTNER. LAWYER uses but doesn't edit.
export function canManageDocumentTemplates(user: PermissionInput): boolean {
  return canViewAllLegalData(user);
}

export function assertCanManageDocumentTemplates(user: PermissionInput) {
  if (!canManageDocumentTemplates(user)) {
    throw new Error("Nemáte oprávnění spravovat šablony dokumentů.");
  }
}

// Visibility for documents (F5). Case/subject-bound and confidentiality-sensitive:
// ADMIN/PARTNER see all org documents; a LAWYER sees ones they created, on a case
// they're responsible for, or on a subject visible to them; TRAINEE/INTERN see
// only ones they created (default-deny on confidential material). Fail-closed.
export function documentVisibilityWhere(
  user: PermissionInput,
): Prisma.DocumentWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.DocumentWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.DocumentWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        { createdById: userId },
        { case: { is: { responsibleUserId: userId } } },
        { case: { is: { project: { is: { responsibleUserId: userId } } } } },
        // Assignee mirror: documents on a case the user is assigned to.
        { case: { is: caseAssigneeWhere(userId) } },
        { case: { is: { project: { is: projectAssigneeWhere(userId) } } } },
        { subject: { is: subjectVisibilityWhere(user) } },
      ],
    });
  }

  return andWhere(org, { createdById: userId });
}

// Templates are office-wide: any org member who has the module may read them.
// Fail-closed without an org.
export function documentTemplateVisibilityWhere(
  user: PermissionInput,
): Prisma.DocumentTemplateWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.DocumentTemplateWhereInput>();
  }
  return org;
}

// Who may grant/revoke client portal access and share records with clients:
// ADMIN, PARTNER, LAWYER (sharing confidential data with an external party is a
// case-handling decision). TRAINEE/INTERN are excluded.
export function canManagePortal(user: PermissionInput): boolean {
  return canViewAllLegalData(user) || roleOf(user) === UserRole.LAWYER;
}

export function assertCanManagePortal(user: PermissionInput) {
  if (!canManagePortal(user)) {
    throw new Error("Nemáte oprávnění spravovat klientský portál.");
  }
}

// HR / Docházka (F7). HR data are personal/sensitive (payroll, absences), so
// management (employees, approvals, exports) is restricted to ADMIN/PARTNER (the
// HR manager). Regular employees see and request only their OWN records.
export function canManageHr(user: PermissionInput): boolean {
  return canViewAllLegalData(user);
}

export function assertCanManageHr(user: PermissionInput) {
  if (!canManageHr(user)) {
    throw new Error("Nemáte oprávnění spravovat HR a docházku.");
  }
}

// Employee visibility: ADMIN/PARTNER see all employees in the org; everyone else
// sees only their own employee record (linked via userId). Fail-closed w/o org.
export function hrEmployeeVisibilityWhere(
  user: PermissionInput,
): Prisma.HrEmployeeWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.HrEmployeeWhereInput>();
  }
  if (canManageHr(user)) {
    return org;
  }
  const userId = userIdOf(user);
  if (!userId) {
    return denyWhere<Prisma.HrEmployeeWhereInput>();
  }
  return andWhere(org, { userId });
}

// Attendance/absence visibility derives from the employee: managers see all org
// records, others only rows for their own employee (employee.userId === me).
export function hrAttendanceVisibilityWhere(
  user: PermissionInput,
): Prisma.HrAttendanceRecordWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.HrAttendanceRecordWhereInput>();
  }
  if (canManageHr(user)) {
    return org;
  }
  const userId = userIdOf(user);
  if (!userId) {
    return denyWhere<Prisma.HrAttendanceRecordWhereInput>();
  }
  return andWhere(org, { employee: { is: { userId } } });
}

export function hrAbsenceVisibilityWhere(
  user: PermissionInput,
): Prisma.HrAbsenceRequestWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.HrAbsenceRequestWhereInput>();
  }
  if (canManageHr(user)) {
    return org;
  }
  const userId = userIdOf(user);
  if (!userId) {
    return denyWhere<Prisma.HrAbsenceRequestWhereInput>();
  }
  return andWhere(org, { employee: { is: { userId } } });
}

// Visibility for court hearings (F4) — same case-derived rules as deadlines.
export function courtHearingVisibilityWhere(
  user: PermissionInput,
): Prisma.CourtHearingWhereInput {
  const org = orgClause(user);
  if (!org) {
    return denyWhere<Prisma.CourtHearingWhereInput>();
  }

  if (canViewAllLegalData(user)) {
    return org;
  }

  const userId = userIdOf(user);
  const role = roleOf(user);

  if (!userId || !role) {
    return denyWhere<Prisma.CourtHearingWhereInput>();
  }

  if (role === UserRole.LAWYER) {
    return andWhere(org, {
      OR: [
        { responsibleUserId: userId },
        { createdById: userId },
        { case: { is: { responsibleUserId: userId } } },
        { case: { is: { project: { is: { responsibleUserId: userId } } } } },
        // Assignee mirror: court hearings on a case the user is assigned to.
        { case: { is: caseAssigneeWhere(userId) } },
        { case: { is: { project: { is: projectAssigneeWhere(userId) } } } },
      ],
    });
  }

  return andWhere(org, {
    OR: [{ responsibleUserId: userId }, { createdById: userId }],
  });
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
        // Assignee mirror: references on a project/case the user is assigned to.
        { project: { is: projectAssigneeWhere(userId) } },
        { case: { is: caseAssigneeWhere(userId) } },
        {
          case: {
            is: { project: { is: projectAssigneeWhere(userId) } },
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
    if (role === UserRole.LAWYER && project.responsibleUserId === userId) {
      return true;
    }
    // Assignees (LAWYER + TRAINEE) see the project they're assigned to.
    return (
      (role === UserRole.LAWYER || role === UserRole.TRAINEE) &&
      isAssigneeOf(project.assignees, userId)
    );
  }

  if (type === "Case") {
    const legalCase = record as CaseRecord;
    if (
      role === UserRole.LAWYER &&
      (legalCase.responsibleUserId === userId ||
        legalCase.project?.responsibleUserId === userId)
    ) {
      return true;
    }
    // Assignees (LAWYER + TRAINEE) see a case they're assigned to, or whose
    // project they're assigned to.
    return (
      (role === UserRole.LAWYER || role === UserRole.TRAINEE) &&
      (isAssigneeOf(legalCase.assignees, userId) ||
        isAssigneeOf(legalCase.project?.assignees, userId))
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
    const project = record as ProjectRecord;
    return (
      role === UserRole.LAWYER &&
      (project.responsibleUserId === userId ||
        isAssigneeOf(project.assignees, userId))
    );
  }

  if (type === "Case") {
    const legalCase = record as CaseRecord;
    return (
      role === UserRole.LAWYER &&
      (legalCase.responsibleUserId === userId ||
        isAssigneeOf(legalCase.assignees, userId))
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
