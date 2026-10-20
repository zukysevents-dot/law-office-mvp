import type { Prisma } from "@/generated/prisma/client";
import { Capability, UserRole } from "@/generated/prisma/enums";
import type {
  FunctionPermissionKey,
  ModulePermissionKey,
  PermissionKey,
  PermissionScope,
  ScopePermissionKey,
} from "@/lib/permission-catalog";
import {
  defaultPermissionsForRole,
  resolvePermissions,
  type EffectivePermissions,
} from "@/lib/permission-resolver";

// Autorita pro přístup k datům a funkcím. Každý helper tady čte EFEKTIVNÍ
// MATICI OPRÁVNĚNÍ uživatele (src/lib/permission-catalog.ts + výjimky role a
// uživatele v kanceláři), kterou getCurrentUser() vyhodnotí jednou za request a
// přibalí na usera jako `permissions`. Role-only calleři (string role, unit
// testy) dostanou výchozí hodnoty své role. Izolace kanceláří (orgClause) platí
// vždy a jako první, bez ohledu na matici.

type PermissionUser = {
  id: string;
  role: UserRole;
  // Present on users resolved via getCurrentUser(); absent when only a role is
  // passed. Visibility helpers DENY when it's missing (fail closed).
  organizationId?: string | null;
  isPlatformAdmin?: boolean;
  // Starší per-user granty (deprecated, čtou se jako fallback ALLOW).
  capabilities?: Capability[];
  // Efektivní matice oprávnění z getCurrentUser(). Chybí-li, spočítá se
  // z role (+ capabilities) bez výjimek kanceláře.
  permissions?: EffectivePermissions;
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

function isKnownRole(role: unknown): role is UserRole {
  return (
    typeof role === "string" &&
    (Object.values(UserRole) as string[]).includes(role)
  );
}

function userIdOf(user: PermissionInput) {
  return typeof user === "string" ? null : user?.id ?? null;
}

function orgIdOf(user: PermissionInput): string | null {
  return typeof user === "string" ? null : user?.organizationId ?? null;
}

// Efektivní matice pro libovolný vstup. Fail-closed: null/neznámá role → nic.
export function permissionsOf(user: PermissionInput): EffectivePermissions {
  if (!user) {
    return resolvePermissions({ role: null });
  }
  if (typeof user === "string") {
    return defaultPermissionsForRole(user);
  }
  if (user.permissions) {
    return user.permissions;
  }
  if (!user.capabilities || user.capabilities.length === 0) {
    return defaultPermissionsForRole(user.role);
  }
  return resolvePermissions({
    role: user.role,
    legacyCapabilities: user.capabilities,
  });
}

// True when the boolean permission (module / function) is granted.
export function hasPermission(
  user: PermissionInput,
  key: ModulePermissionKey | FunctionPermissionKey,
): boolean {
  return permissionsOf(user)[key as PermissionKey] === true;
}

// Data scope of the user for an entity ("ALL" | "ASSIGNED" | "OWN").
export function scopeOf(
  user: PermissionInput,
  key: ScopePermissionKey,
): PermissionScope {
  return permissionsOf(user)[key] as PermissionScope;
}

// True když uživatel nese daný starší per-user grant (deprecated tabulka).
// Fail-closed: string/role-only/null user nebo chybějící pole → false.
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

// --- Funkce (function.*) ----------------------------------------------------

// Subject registry and references are office-wide records: they can become
// visible to multiple matters and contain commercial/risk data. Anyone allowed
// to create one can subsequently edit it (same permission).
export function canManageSubjects(user: PermissionInput) {
  return Boolean(orgIdOf(user)) && hasPermission(user, "function.manageSubjects");
}

export function assertCanManageSubjects(user: PermissionInput) {
  if (!canManageSubjects(user)) {
    throw new Error("Nemáte oprávnění spravovat subjekty.");
  }
}

export function canManageReferences(user: PermissionInput) {
  return (
    Boolean(orgIdOf(user)) && hasPermission(user, "function.manageReferences")
  );
}

export function assertCanManageReferences(user: PermissionInput) {
  if (!canManageReferences(user)) {
    throw new Error("Nemáte oprávnění spravovat reference.");
  }
}

// Hourly rates / flat fees / billed amounts. Default: ADMIN/PARTNER; others via
// role override or a per-user exception (incl. the legacy VIEW_RATES grant).
export function canViewRates(user: PermissionInput) {
  return hasPermission(user, "function.viewRates");
}

// Who may mark work directly billable. Without it a user only picks
// "ke schválení" / "interní" — a partner/advokát decides what gets billed.
export function canSetBillableStatus(user: PermissionInput) {
  return hasPermission(user, "function.setBillable");
}

export function canArchiveRecords(user: PermissionInput) {
  return hasPermission(user, "function.archiveRecords");
}

export function assertCanArchiveRecords(user: PermissionInput) {
  if (!canArchiveRecords(user)) {
    throw new Error("Nemáte oprávnění archivovat ani obnovovat záznamy.");
  }
}

export function canManageUsers(user: PermissionInput) {
  return Boolean(orgIdOf(user)) && hasPermission(user, "function.manageUsers");
}

export function assertCanManageUsers(user: PermissionInput) {
  if (!canManageUsers(user)) {
    throw new Error("Nemáte oprávnění spravovat uživatele.");
  }
}

// Office-wide approval of billing documents. Client-level approvers
// (SubjectBillingApprover) approve their client's logs even without it.
export function canApproveWorkLogs(user: PermissionInput) {
  return hasPermission(user, "function.approveWorkLogs");
}

export function assertCanApproveBilling(user: PermissionInput) {
  if (!canApproveWorkLogs(user)) {
    throw new Error("Nemáte oprávnění schvalovat fakturační podklady.");
  }
}

export function canViewAuditLog(user: PermissionInput) {
  return Boolean(orgIdOf(user)) && hasPermission(user, "module.auditLog");
}

export function assertCanViewAuditLog(user: PermissionInput) {
  if (!canViewAuditLog(user)) {
    throw new Error("Nemáte oprávnění zobrazit audit log.");
  }
}

// Office settings: members & roles, join codes, teams, billing profile, data
// box accounts, SharePoint connection.
export function canManageOrganization(user: PermissionInput) {
  return (
    Boolean(orgIdOf(user)) && hasPermission(user, "function.manageOrganization")
  );
}

// Reports across colleagues/teams, billability KPIs, WIP, colleague filter.
export function canViewTeamReports(user: PermissionInput) {
  return hasPermission(user, "function.viewTeamReports");
}

// The permission matrix itself. ADMIN always (resolver), others only with the
// permission — which in turn only an ADMIN may grant.
export function canManagePermissions(user: PermissionInput) {
  return (
    Boolean(orgIdOf(user)) && hasPermission(user, "function.managePermissions")
  );
}

export function assertCanManagePermissions(user: PermissionInput) {
  if (!canManagePermissions(user)) {
    throw new Error("Nemáte oprávnění spravovat oprávnění.");
  }
}

// Platform/developer super-admin over all organizations (the /admin panel).
export function assertPlatformAdmin(user: PermissionInput) {
  const ok = typeof user === "string" ? false : Boolean(user?.isPlatformAdmin);
  if (!ok) {
    throw new Error("Přístup pouze pro správce platformy.");
  }
}

// Authorizes administering a SPECIFIC org: platform admin (any org) OR a member
// with "Spravuje nastavení kanceláře" acting within their own org. Used by the
// shared org actions so /admin and /settings/organization can reuse them safely.
export function assertCanAdministerOrg(
  user: PermissionInput,
  organizationId: string,
) {
  if (typeof user !== "string" && user?.isPlatformAdmin) {
    return;
  }
  if (canManageOrganization(user) && orgIdOf(user) === organizationId) {
    return;
  }
  throw new Error("Nemáte oprávnění spravovat tuto kancelář.");
}

// Throws if the record belongs to a different organization than the user. Used
// by archive/restore actions (which gate on permission, not on canEditRecord).
export function assertSameOrg(user: PermissionInput, record: ViewRecord) {
  if (orgMismatch(user, record)) {
    throw new Error("Záznam patří jiné kanceláři.");
  }
}

// --- Rozsah dat (scope.*) -----------------------------------------------------
//
// "Přiřazené" buildery jsou ZÁMĚRNĚ nezávislé na rozsahu ostatních entit: kdyby
// dokumenty skládaly subjectVisibilityWhere(user), výchozí rozsah ALL u subjektů
// by advokátovi odkryl všechny dokumenty všech subjektů. Každý builder je přesně
// dřívější větev role LAWYER.

function assignedTaskWhere(userId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      directTaskUserWhere(userId),
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
  };
}

function assignedProjectWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { responsibleUserId: userId },
      { assignees: { some: { userId } } },
      { cases: { some: { responsibleUserId: userId } } },
      { cases: { some: { assignees: { some: { userId } } } } },
      { tasks: { some: directTaskUserWhere(userId) } },
      { workLogs: { some: { userId } } },
    ],
  };
}

function assignedCaseWhere(userId: string): Prisma.CaseWhereInput {
  return {
    OR: [
      { responsibleUserId: userId },
      { assignees: { some: { userId } } },
      { project: { is: { responsibleUserId: userId } } },
      { project: { is: projectAssigneeWhere(userId) } },
      { tasks: { some: directTaskUserWhere(userId) } },
      { workLogs: { some: { userId } } },
    ],
  };
}

function assignedWorkLogWhere(userId: string): Prisma.WorkLogWhereInput {
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
      // Assignee mirror: work-logs on a project/case the user is assigned to.
      { project: { is: projectAssigneeWhere(userId) } },
      { case: { is: caseAssigneeWhere(userId) } },
      {
        case: {
          is: { project: { is: projectAssigneeWhere(userId) } },
        },
      },
    ],
  };
}

function assignedReferenceWhere(userId: string): Prisma.ReferenceWhereInput {
  return {
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
  };
}

function assignedSubjectWhere(
  userId: string,
  org: { organizationId: string },
): Prisma.SubjectWhereInput {
  const projectWhere = andWhere<Prisma.ProjectWhereInput>(
    org,
    assignedProjectWhere(userId),
  );
  const caseWhere = andWhere<Prisma.CaseWhereInput>(
    org,
    assignedCaseWhere(userId),
  );
  return {
    OR: [
      { mainProjects: { some: projectWhere } },
      { relations: { some: { project: { is: projectWhere } } } },
      { relations: { some: { case: { is: caseWhere } } } },
      { workLogs: { some: andWhere(org, assignedWorkLogWhere(userId)) } },
      { references: { some: andWhere(org, assignedReferenceWhere(userId)) } },
    ],
  };
}

function assignedInvoiceWhere(userId: string): Prisma.InvoiceWhereInput {
  return {
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
  };
}

function assignedDataMessageWhere(
  userId: string,
): Prisma.DataMessageWhereInput {
  return {
    OR: [
      { createdById: userId },
      { case: { is: { responsibleUserId: userId } } },
      { case: { is: { project: { is: { responsibleUserId: userId } } } } },
      // Assignee mirror: data messages on a case the user is assigned to.
      { case: { is: caseAssigneeWhere(userId) } },
      { case: { is: { project: { is: projectAssigneeWhere(userId) } } } },
    ],
  };
}

function assignedDeadlineWhere(userId: string): Prisma.DeadlineWhereInput {
  return {
    OR: [
      { responsibleUserId: userId },
      { createdById: userId },
      { case: { is: { responsibleUserId: userId } } },
      { case: { is: { project: { is: { responsibleUserId: userId } } } } },
      // Assignee mirror: deadlines on a case the user is assigned to.
      { case: { is: caseAssigneeWhere(userId) } },
      { case: { is: { project: { is: projectAssigneeWhere(userId) } } } },
    ],
  };
}

function assignedCourtHearingWhere(
  userId: string,
): Prisma.CourtHearingWhereInput {
  return {
    OR: [
      { responsibleUserId: userId },
      { createdById: userId },
      { case: { is: { responsibleUserId: userId } } },
      { case: { is: { project: { is: { responsibleUserId: userId } } } } },
      // Assignee mirror: court hearings on a case the user is assigned to.
      { case: { is: caseAssigneeWhere(userId) } },
      { case: { is: { project: { is: projectAssigneeWhere(userId) } } } },
    ],
  };
}

function assignedDocumentWhere(
  userId: string,
  org: { organizationId: string },
): Prisma.DocumentWhereInput {
  return {
    OR: [
      { createdById: userId },
      { case: { is: { responsibleUserId: userId } } },
      { case: { is: { project: { is: { responsibleUserId: userId } } } } },
      // Assignee mirror: documents on a case the user is assigned to.
      { case: { is: caseAssigneeWhere(userId) } },
      { case: { is: { project: { is: projectAssigneeWhere(userId) } } } },
      {
        subject: {
          is: andWhere<Prisma.SubjectWhereInput>(
            org,
            assignedSubjectWhere(userId, org),
          ),
        },
      },
    ],
  };
}

// Common shape of every scoped *VisibilityWhere: org first (isolation), then
// the user's scope for the entity. ALL → whole office; ASSIGNED / OWN → the
// matching builder (OWN falls back to ASSIGNED where an entity has no OWN
// variant — the catalog never offers it there anyway). Fail-closed without an
// org, a known role, or (for narrowed scopes) a user id.
function scopedWhere<T extends object>(
  user: PermissionInput,
  key: ScopePermissionKey,
  assigned: (userId: string, org: { organizationId: string }) => object,
  own?: (userId: string) => object,
): T {
  const org = orgClause(user);
  if (!org || !isKnownRole(roleOf(user))) {
    return denyWhere<T>();
  }

  const scope = scopeOf(user, key);
  if (scope === "ALL") {
    return org as T;
  }

  const userId = userIdOf(user);
  if (!userId) {
    return denyWhere<T>();
  }

  if (scope === "OWN" && own) {
    return andWhere<T>(org, own(userId));
  }
  return andWhere<T>(org, assigned(userId, org));
}

export function taskVisibilityWhere(user: PermissionInput): Prisma.TaskWhereInput {
  return scopedWhere(user, "scope.tasks", assignedTaskWhere);
}

export function projectVisibilityWhere(
  user: PermissionInput,
): Prisma.ProjectWhereInput {
  return scopedWhere(user, "scope.projects", assignedProjectWhere);
}

export function caseVisibilityWhere(user: PermissionInput): Prisma.CaseWhereInput {
  return scopedWhere(user, "scope.cases", assignedCaseWhere);
}

export function workLogVisibilityWhere(
  user: PermissionInput,
): Prisma.WorkLogWhereInput {
  return scopedWhere(user, "scope.workLogs", assignedWorkLogWhere, (userId) => ({
    userId,
  }));
}

// Work logs whose client explicitly assigned this user as a billing approver.
// A log may carry the client directly or inherit it from its project/case.
export function billingApproverWorkLogWhere(
  userId: string,
): Prisma.WorkLogWhereInput {
  const assignment = { billingApprovers: { some: { userId } } };
  return {
    OR: [
      { subject: { is: assignment } },
      { project: { is: { mainSubject: { is: assignment } } } },
      {
        case: {
          is: { project: { is: { mainSubject: { is: assignment } } } },
        },
      },
    ],
  };
}

export function invoiceVisibilityWhere(
  user: PermissionInput,
): Prisma.InvoiceWhereInput {
  return scopedWhere(user, "scope.invoices", assignedInvoiceWhere, (userId) => ({
    createdById: userId,
  }));
}

// Who may create/issue/cancel client invoices, record payments, send reminders
// and manage retainers. Default: ADMIN/PARTNER; others via the matrix (the
// legacy MANAGE_INVOICES grant counts as a per-user ALLOW).
export function canManageInvoices(user: PermissionInput) {
  return hasPermission(user, "function.manageInvoices");
}

export function assertCanManageInvoices(user: PermissionInput) {
  if (!canManageInvoices(user)) {
    throw new Error("Nemáte oprávnění spravovat faktury.");
  }
}

// Data-box content is sensitive. Default: ADMIN/PARTNER whole office, LAWYER
// own + messages of their cases, juniors only what they recorded.
export function dataMessageVisibilityWhere(
  user: PermissionInput,
): Prisma.DataMessageWhereInput {
  return scopedWhere(
    user,
    "scope.dataMessages",
    assignedDataMessageWhere,
    (userId) => ({ createdById: userId }),
  );
}

// Who may record/assign/send data messages. (Configuring a DataBoxAccount is
// stricter — "Spravuje nastavení kanceláře" via assertCanAdministerOrg.)
export function canManageDataBoxes(user: PermissionInput) {
  return hasPermission(user, "function.manageDataBoxes");
}

export function assertCanManageDataBoxes(user: PermissionInput) {
  if (!canManageDataBoxes(user)) {
    throw new Error("Nemáte oprávnění pracovat s datovými schránkami.");
  }
}

// AML/KYC data is compliance-sensitive (identity documents, PEP/sanctions).
export function canManageAml(user: PermissionInput): boolean {
  return hasPermission(user, "function.manageAml");
}

export function assertCanManageAml(user: PermissionInput) {
  if (!canManageAml(user)) {
    throw new Error("Nemáte oprávnění k AML/KYC údajům.");
  }
}

// Closing a procedural deadline is a liability act, so by default juniors
// don't manage deadlines/hearings.
export function canManageDeadlines(user: PermissionInput): boolean {
  return hasPermission(user, "function.manageDeadlines");
}

export function assertCanManageDeadlines(user: PermissionInput) {
  if (!canManageDeadlines(user)) {
    throw new Error("Nemáte oprávnění spravovat lhůty.");
  }
}

export function deadlineVisibilityWhere(
  user: PermissionInput,
): Prisma.DeadlineWhereInput {
  return scopedWhere(user, "scope.deadlines", assignedDeadlineWhere, (userId) => ({
    OR: [{ responsibleUserId: userId }, { createdById: userId }],
  }));
}

// Documents are case/subject-bound work artifacts under attorney
// confidentiality; by default juniors don't author or version them.
export function canManageDocuments(user: PermissionInput): boolean {
  return hasPermission(user, "function.manageDocuments");
}

export function assertCanManageDocuments(user: PermissionInput) {
  if (!canManageDocuments(user)) {
    throw new Error("Nemáte oprávnění spravovat dokumenty.");
  }
}

// Templates are an office-wide asset (they change generation for everyone).
export function canManageDocumentTemplates(user: PermissionInput): boolean {
  return hasPermission(user, "function.manageDocumentTemplates");
}

export function assertCanManageDocumentTemplates(user: PermissionInput) {
  if (!canManageDocumentTemplates(user)) {
    throw new Error("Nemáte oprávnění spravovat šablony dokumentů.");
  }
}

export function documentVisibilityWhere(
  user: PermissionInput,
): Prisma.DocumentWhereInput {
  return scopedWhere(user, "scope.documents", assignedDocumentWhere, (userId) => ({
    createdById: userId,
  }));
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

// Who may grant/revoke client portal access and share records with clients
// (sharing confidential data with an external party is a case decision).
export function canManagePortal(user: PermissionInput): boolean {
  return hasPermission(user, "function.managePortal");
}

export function assertCanManagePortal(user: PermissionInput) {
  if (!canManagePortal(user)) {
    throw new Error("Nemáte oprávnění spravovat klientský portál.");
  }
}

// HR data are personal/sensitive (payroll, absences): management (employees,
// approvals, exports) needs "Spravuje HR a docházku"; everyone else sees and
// requests only their OWN records.
export function canManageHr(user: PermissionInput): boolean {
  return hasPermission(user, "function.manageHr");
}

export function assertCanManageHr(user: PermissionInput) {
  if (!canManageHr(user)) {
    throw new Error("Nemáte oprávnění spravovat HR a docházku.");
  }
}

// Employee visibility: HR managers see all employees in the org; everyone else
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

// Court hearings share the deadline scope (one "Lhůty a soudní jednání" row).
export function courtHearingVisibilityWhere(
  user: PermissionInput,
): Prisma.CourtHearingWhereInput {
  return scopedWhere(
    user,
    "scope.deadlines",
    assignedCourtHearingWhere,
    (userId) => ({
      OR: [{ responsibleUserId: userId }, { createdById: userId }],
    }),
  );
}

export function referenceVisibilityWhere(
  user: PermissionInput,
): Prisma.ReferenceWhereInput {
  return scopedWhere(user, "scope.references", assignedReferenceWhere);
}

export function subjectVisibilityWhere(
  user: PermissionInput,
): Prisma.SubjectWhereInput {
  return scopedWhere(user, "scope.subjects", assignedSubjectWhere);
}

// In-memory view check for an already loaded record. Query-layer visibility
// (*VisibilityWhere) is authoritative; this mirrors it for the fields a record
// carries (relations like tasks/work-logs aren't loaded, so a narrowed scope
// only honours responsibility/assignment/ownership here).
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

  if (!isKnownRole(roleOf(user))) {
    return false;
  }

  const scopeKey: Record<RecordType, ScopePermissionKey> = {
    Task: "scope.tasks",
    Project: "scope.projects",
    Case: "scope.cases",
    WorkLog: "scope.workLogs",
    Reference: "scope.references",
    Subject: "scope.subjects",
  };
  if (scopeOf(user, scopeKey[type]) === "ALL") {
    return true;
  }

  const userId = userIdOf(user);
  if (!userId) {
    return false;
  }

  if (type === "Task") {
    const task = record as AssignmentRecord & {
      project?: ProjectRecord | null;
      case?: CaseRecord | null;
    };

    return (
      hasDirectTaskAccess(task, userId) ||
      task.project?.responsibleUserId === userId ||
      task.case?.responsibleUserId === userId ||
      task.case?.project?.responsibleUserId === userId ||
      isAssigneeOf(task.project?.assignees, userId) ||
      isAssigneeOf(task.case?.assignees, userId) ||
      isAssigneeOf(task.case?.project?.assignees, userId)
    );
  }

  if (type === "Project") {
    const project = record as ProjectRecord;
    return (
      project.responsibleUserId === userId ||
      isAssigneeOf(project.assignees, userId)
    );
  }

  if (type === "Case") {
    const legalCase = record as CaseRecord;
    return (
      legalCase.responsibleUserId === userId ||
      legalCase.project?.responsibleUserId === userId ||
      isAssigneeOf(legalCase.assignees, userId) ||
      isAssigneeOf(legalCase.project?.assignees, userId)
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

  if (type === "Subject") {
    return canManageSubjects(user);
  }

  if (type === "Reference") {
    return canManageReferences(user);
  }

  if (!isKnownRole(roleOf(user))) {
    return false;
  }

  if (
    (type === "Task" || type === "Project" || type === "Case") &&
    hasPermission(user, "function.editAllMatters")
  ) {
    return true;
  }

  if (type === "WorkLog" && hasPermission(user, "function.editAllWorkLogs")) {
    return true;
  }

  const userId = userIdOf(user);

  if (!userId) {
    return false;
  }

  if (type === "Task") {
    return hasDirectTaskAccess(record as AssignmentRecord, userId);
  }

  if (type === "Project") {
    const project = record as ProjectRecord;
    return (
      hasPermission(user, "function.editAssignedMatters") &&
      (project.responsibleUserId === userId ||
        isAssigneeOf(project.assignees, userId))
    );
  }

  if (type === "Case") {
    const legalCase = record as CaseRecord;
    return (
      hasPermission(user, "function.editAssignedMatters") &&
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
