import assert from "node:assert/strict";
import { test } from "node:test";

import { Capability, UserRole } from "@/generated/prisma/enums";

import {
  andWhere,
  billingApproverWorkLogWhere,
  assertCanManageReferences,
  assertCanManageSubjects,
  assertCanManageAml,
  assertCanManageDeadlines,
  assertCanManageInvoices,
  canManageInvoices,
  canViewRates,
  hasCapability,
  assertCanManageHr,
  assertCanManagePortal,
  canEditRecord,
  canWorkOnTask,
  assertCanWorkOnTask,
  canManageAml,
  canManageDeadlines,
  canManageDocumentTemplates,
  canManageDocuments,
  canManageHr,
  canManagePortal,
  canManageReferences,
  canManageSubjects,
  canManageTeams,
  canBulkAssign,
  canOpenAssignments,
  canApproveWorkLogs,
  canArchiveRecords,
  canManageOrganization,
  canManagePermissions,
  canManageUsers,
  canViewAuditLog,
  canViewTeamReports,
  assertCanAdministerOrg,
  canViewRecord,
  caseVisibilityWhere,
  courtHearingVisibilityWhere,
  dataMessageVisibilityWhere,
  deadlineVisibilityWhere,
  documentTemplateVisibilityWhere,
  documentVisibilityWhere,
  hrAbsenceVisibilityWhere,
  hrAttendanceVisibilityWhere,
  hrEmployeeVisibilityWhere,
  invoiceVisibilityWhere,
  privilegedTargetDenial,
  projectVisibilityWhere,
  referenceVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
  workLogVisibilityWhere,
} from "./permissions";
import { resolvePermissions } from "./permission-resolver";

// Users resolved via getCurrentUser() always carry an organizationId; the
// visibility helpers fail closed (deny) without one. Fixtures must include it so
// these tests exercise the role logic rather than the org-gate. The expected
// where-fragments below therefore include the org scoping that the production
// code prepends via andWhere(orgClause(user), ...).
const org = "org-1";
const admin = { id: "u-admin", role: UserRole.ADMIN, organizationId: org };
const partner = { id: "u-partner", role: UserRole.PARTNER, organizationId: org };
const lawyer = { id: "u-lawyer", role: UserRole.LAWYER, organizationId: org };
const trainee = { id: "u-trainee", role: UserRole.TRAINEE, organizationId: org };
const intern = { id: "u-intern", role: UserRole.INTERN, organizationId: org };

// A user whose role was tightened (or widened) in the permission matrix — the
// same shape getCurrentUser() returns (permissions resolved from overrides).
function withOverrides(
  user: { id: string; role: UserRole; organizationId: string },
  roleOverrides: Array<{ permission: string; value: string }>,
  userOverrides: Array<{ permission: string; value: string }> = [],
) {
  return {
    ...user,
    permissions: resolvePermissions({ role: user.role, roleOverrides, userOverrides }),
  };
}

// Tvar týmové větve (src/lib/assignments.ts teamMemberWhere).
function teamMember(userId: string) {
  return {
    legalTeam: { is: { archivedAt: null, members: { some: { userId } } } },
  };
}

const ASSIGNED_MATTERS = [
  { permission: "scope.subjects", value: "ASSIGNED" },
  { permission: "scope.projects", value: "ASSIGNED" },
  { permission: "scope.cases", value: "ASSIGNED" },
  { permission: "scope.tasks", value: "ASSIGNED" },
];

// --- Office-wide functions (formerly canViewAllLegalData): ADMIN/PARTNER by default ---
test("leadership functions: ADMIN and PARTNER true, others false by default", () => {
  for (const fn of [
    canArchiveRecords,
    canApproveWorkLogs,
    canManageOrganization,
    canManagePermissions,
    canManageUsers,
    canViewAuditLog,
    canViewTeamReports,
  ]) {
    assert.equal(fn(admin), true, fn.name);
    assert.equal(fn(partner), true, fn.name);
    assert.equal(fn(lawyer), false, fn.name);
    assert.equal(fn(trainee), false, fn.name);
    assert.equal(fn(intern), false, fn.name);
    assert.equal(fn(null), false, fn.name);
  }
});

// --- Subject/Reference management: office-wide records, leadership only ---
test("Subject/Reference management: ADMIN/PARTNER with an org may manage", () => {
  for (const user of [admin, partner]) {
    assert.equal(canManageSubjects(user), true);
    assert.equal(canManageReferences(user), true);
    assert.doesNotThrow(() => assertCanManageSubjects(user));
    assert.doesNotThrow(() => assertCanManageReferences(user));
  }
});

test("Subject/Reference management: LAWYER and junior roles are read-only", () => {
  for (const user of [lawyer, trainee, intern]) {
    assert.equal(canManageSubjects(user), false);
    assert.equal(canManageReferences(user), false);
    assert.throws(() => assertCanManageSubjects(user), {
      message: "Nemáte oprávnění spravovat subjekty.",
    });
    assert.throws(() => assertCanManageReferences(user), {
      message: "Nemáte oprávnění spravovat reference.",
    });
  }
});

test("Subject/Reference management: missing org or user fails closed", () => {
  const orglessAdmin = { id: "u-orgless", role: UserRole.ADMIN };
  for (const user of [orglessAdmin, null, undefined]) {
    assert.equal(canManageSubjects(user), false);
    assert.equal(canManageReferences(user), false);
  }
});

test("Subject/Reference policy: create eligibility always implies same-org edit", () => {
  for (const user of [admin, partner, lawyer, trainee, intern]) {
    const record = { organizationId: org };
    assert.equal(
      canEditRecord(user, "Subject", record),
      canManageSubjects(user),
    );
    assert.equal(
      canEditRecord(user, "Reference", record),
      canManageReferences(user),
    );
  }
});

test("Subject/Reference edit: crafted foreign-org id never expands access", () => {
  const foreignRecord = { organizationId: "org-2" };
  assert.equal(canEditRecord(admin, "Subject", foreignRecord), false);
  assert.equal(canEditRecord(partner, "Reference", foreignRecord), false);
  assert.equal(canEditRecord(lawyer, "Subject", { organizationId: org }), false);
  assert.equal(canEditRecord(lawyer, "Reference", { organizationId: org }), false);
});

test("Subject/Reference visibility remains broader than management for LAWYER", () => {
  assert.deepEqual(referenceVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(subjectVisibilityWhere(admin), { organizationId: org });
  // New default: every role sees all subjects of the office.
  assert.deepEqual(subjectVisibilityWhere(lawyer), { organizationId: org });

  const referenceWhere = referenceVisibilityWhere(lawyer) as {
    AND?: Array<{ organizationId?: string; OR?: unknown[] }>;
  };
  assert.deepEqual(referenceWhere.AND?.[0], { organizationId: org });
  assert.equal(referenceWhere.AND?.[1]?.OR?.length, 13);

  const subjectWhere = subjectVisibilityWhere(
    withOverrides(lawyer, ASSIGNED_MATTERS),
  ) as {
    AND?: Array<{ organizationId?: string; OR?: unknown[] }>;
  };
  assert.deepEqual(subjectWhere.AND?.[0], { organizationId: org });
  assert.equal(subjectWhere.AND?.[1]?.OR?.length, 5);
  assert.equal(canManageReferences(lawyer), false);
  assert.equal(canManageSubjects(lawyer), false);
});

// --- canManageAml / assertCanManageAml: AML/KYC restricted to ADMIN/PARTNER ---
// Compliance-sensitive identity data (ID documents, PEP/sanctions) must never be
// reachable by junior roles or an unauthenticated/org-less caller.
test("canManageAml: ADMIN and PARTNER true, juniors false", () => {
  assert.equal(canManageAml(admin), true);
  assert.equal(canManageAml(partner), true);
  assert.equal(canManageAml(lawyer), false);
  assert.equal(canManageAml(trainee), false);
  assert.equal(canManageAml(intern), false);
});

test("canManageAml: no role / no org / null user → false (fail closed)", () => {
  // Caller carrying only an id but no role must not pass the AML gate.
  assert.equal(canManageAml({ id: "u-x", role: undefined as never }), false);
  // Org-less user (role present, organizationId missing) — still denied: AML
  // access never depends on org alone, only on the senior role.
  assert.equal(canManageAml({ id: "u-y", role: UserRole.LAWYER }), false);
  assert.equal(canManageAml(null), false);
  assert.equal(canManageAml(undefined), false);
});

test("assertCanManageAml: ADMIN and PARTNER do NOT throw", () => {
  assert.doesNotThrow(() => assertCanManageAml(admin));
  assert.doesNotThrow(() => assertCanManageAml(partner));
});

test("assertCanManageAml: LAWYER/TRAINEE/INTERN throw the AML message", () => {
  const expected = { message: "Nemáte oprávnění k AML/KYC údajům." };
  assert.throws(() => assertCanManageAml(lawyer), expected);
  assert.throws(() => assertCanManageAml(trainee), expected);
  assert.throws(() => assertCanManageAml(intern), expected);
});

test("assertCanManageAml: missing role / null / undefined throw (fail closed)", () => {
  assert.throws(() => assertCanManageAml({ id: "u-x", role: undefined as never }));
  assert.throws(() => assertCanManageAml(null));
  assert.throws(() => assertCanManageAml(undefined));
});

// --- andWhere: empty clauses dropped, single passthrough, else AND-wrapped ---
test("andWhere: drops empty/nullish clauses", () => {
  assert.deepEqual(andWhere(), {});
  assert.deepEqual(andWhere({}, null, undefined), {});
  assert.deepEqual(andWhere({ a: 1 }, {}), { a: 1 });
});

test("andWhere: single clause passes through, multiple AND-wrapped", () => {
  assert.deepEqual(andWhere({ a: 1 }), { a: 1 });
  assert.deepEqual(andWhere({ a: 1 }, { b: 2 }), { AND: [{ a: 1 }, { b: 2 }] });
});

// --- visibility where-builders: senior → unrestricted, no-id → deny, scoped → own ---
test("taskVisibilityWhere: ADMIN/PARTNER unrestricted within their org", () => {
  // Seniors see everything, but still only inside their own organization.
  assert.deepEqual(taskVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(taskVisibilityWhere(partner), { organizationId: org });
});

test("taskVisibilityWhere: missing user → fail-closed deny clause", () => {
  assert.deepEqual(taskVisibilityWhere(null), { id: "__role_denied__" });
});

test("default: every role sees all subjects, projects, cases and tasks of its office", () => {
  for (const user of [admin, partner, lawyer, trainee, intern]) {
    assert.deepEqual(taskVisibilityWhere(user), { organizationId: org }, user.role);
    assert.deepEqual(projectVisibilityWhere(user), { organizationId: org }, user.role);
    assert.deepEqual(caseVisibilityWhere(user), { organizationId: org }, user.role);
    assert.deepEqual(subjectVisibilityWhere(user), { organizationId: org }, user.role);
  }
});

test("every scoped *VisibilityWhere denies without an org, even with scope ALL", () => {
  const noOrg = { id: "u-partner", role: UserRole.PARTNER };
  for (const fn of [
    taskVisibilityWhere,
    projectVisibilityWhere,
    caseVisibilityWhere,
    subjectVisibilityWhere,
    workLogVisibilityWhere,
    invoiceVisibilityWhere,
    dataMessageVisibilityWhere,
    deadlineVisibilityWhere,
    courtHearingVisibilityWhere,
    documentVisibilityWhere,
    referenceVisibilityWhere,
  ]) {
    assert.deepEqual(fn(noOrg), { id: "__role_denied__" }, fn.name);
    assert.deepEqual(fn(UserRole.ADMIN), { id: "__role_denied__" }, fn.name);
  }
});

test("taskVisibilityWhere: ASSIGNED scope = direct + responsibility + assignee OR", () => {
  // org-scoped: { AND: [{ organizationId }, { OR: [...10 clauses] }] } — direct,
  // 3 responsibility paths + 3 assignee mirrors + 3 team mirrors
  // (project/case/case→project).
  for (const user of [lawyer, trainee, intern]) {
    const where = taskVisibilityWhere(
      withOverrides(user, [{ permission: "scope.tasks", value: "ASSIGNED" }]),
    ) as {
      AND?: Array<{ organizationId?: string; OR?: unknown[] }>;
    };
    assert.ok(Array.isArray(where.AND));
    assert.deepEqual(where.AND?.[0], { organizationId: org });
    const orClause = where.AND?.[1];
    assert.ok(Array.isArray(orClause?.OR));
    assert.equal(orClause?.OR?.length, 10);
    assert.deepEqual(orClause?.OR?.[0], {
      OR: [
        { createdById: user.id },
        { assignedToId: user.id },
        { responsibleUserId: user.id },
        // Lidé na úkolu: další řešitelé i dohled úkol vidí.
        { assignees: { some: { userId: user.id } } },
      ],
    });
  }
});

test("a per-user override beats the role override", () => {
  const tightened = withOverrides(
    intern,
    [{ permission: "scope.tasks", value: "ASSIGNED" }],
    [{ permission: "scope.tasks", value: "ALL" }],
  );
  assert.deepEqual(taskVisibilityWhere(tightened), { organizationId: org });
});

test("workLogVisibilityWhere: TRAINEE/INTERN see only their own logs", () => {
  // andWhere(orgClause, { userId }) → org AND own-logs; senior → org only.
  assert.deepEqual(workLogVisibilityWhere(trainee), {
    AND: [{ organizationId: org }, { userId: "u-trainee" }],
  });
  assert.deepEqual(workLogVisibilityWhere(intern), {
    AND: [{ organizationId: org }, { userId: "u-intern" }],
  });
  assert.deepEqual(workLogVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(workLogVisibilityWhere(null), { id: "__role_denied__" });
});

// --- dataMessageVisibilityWhere: sensitive DS data, default-deny ---
test("dataMessageVisibilityWhere: missing org → fail-closed deny clause", () => {
  // No organizationId on the user must never leak data-box content.
  const noOrg = { id: "u-x", role: UserRole.LAWYER };
  assert.deepEqual(dataMessageVisibilityWhere(noOrg), { id: "__role_denied__" });
  assert.deepEqual(dataMessageVisibilityWhere(null), { id: "__role_denied__" });
});

test("dataMessageVisibilityWhere: ADMIN/PARTNER see all messages in their org", () => {
  assert.deepEqual(dataMessageVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(dataMessageVisibilityWhere(partner), { organizationId: org });
});

test("dataMessageVisibilityWhere: LAWYER scoped to own + responsible/assigned-case messages", () => {
  // org-scoped: { AND: [{ organizationId }, { OR: [...7 clauses] }] } — own +
  // case/project responsibility + case/project assignee and team mirrors.
  const expected = {
    AND: [
      { organizationId: org },
      {
        OR: [
          { createdById: "u-lawyer" },
          { case: { is: { responsibleUserId: "u-lawyer" } } },
          { case: { is: { project: { is: { responsibleUserId: "u-lawyer" } } } } },
          { case: { is: { assignees: { some: { userId: "u-lawyer" } } } } },
          {
            case: {
              is: { project: { is: { assignees: { some: { userId: "u-lawyer" } } } } },
            },
          },
          { case: { is: { teamAssignments: { some: teamMember("u-lawyer") } } } },
          {
            case: {
              is: {
                project: { is: { teamAssignments: { some: teamMember("u-lawyer") } } },
              },
            },
          },
        ],
      },
    ],
  };
  assert.deepEqual(dataMessageVisibilityWhere(lawyer), expected);
});

test("dataMessageVisibilityWhere: LAWYER OR has exactly the 7 documented branches", () => {
  const where = dataMessageVisibilityWhere(lawyer) as {
    AND?: Array<{ organizationId?: string; OR?: unknown[] }>;
  };
  assert.ok(Array.isArray(where.AND));
  assert.deepEqual(where.AND?.[0], { organizationId: org });
  const orClause = where.AND?.[1];
  assert.ok(Array.isArray(orClause?.OR));
  assert.equal(orClause?.OR?.length, 7);
});

test("dataMessageVisibilityWhere: TRAINEE/INTERN see only messages they created", () => {
  // andWhere(orgClause, { createdById }) → org AND own-created only.
  assert.deepEqual(dataMessageVisibilityWhere(trainee), {
    AND: [{ organizationId: org }, { createdById: "u-trainee" }],
  });
  assert.deepEqual(dataMessageVisibilityWhere(intern), {
    AND: [{ organizationId: org }, { createdById: "u-intern" }],
  });
});

// --- canManageDeadlines: deadline write gate is ADMIN/PARTNER/LAWYER only ---
// Missing/late legal deadlines are a malpractice risk, so editing them is
// reserved for fully-qualified roles. The bool feeds assertCanManageDeadlines
// (below) and the UI's show/hide of the deadline form controls.
test("canManageDeadlines: ADMIN/PARTNER/LAWYER true, TRAINEE/INTERN false", () => {
  assert.equal(canManageDeadlines(admin), true);
  assert.equal(canManageDeadlines(partner), true);
  assert.equal(canManageDeadlines(lawyer), true);
  assert.equal(canManageDeadlines(trainee), false);
  assert.equal(canManageDeadlines(intern), false);
});

test("canManageDeadlines: no role / no org / null / undefined → false (fail closed)", () => {
  // A caller with an id but no role must not pass the deadline gate.
  assert.equal(canManageDeadlines({ id: "u-x", role: undefined as never }), false);
  // Role present but org-less: deadline management depends on the role only,
  // and a missing role on a malformed user must still fail closed.
  assert.equal(canManageDeadlines({ id: "u-y", role: undefined as never }), false);
  assert.equal(canManageDeadlines(null), false);
  assert.equal(canManageDeadlines(undefined), false);
});

// --- assertCanManageDeadlines: ADMIN/PARTNER/LAWYER may manage deadlines ---
test("assertCanManageDeadlines: ADMIN/PARTNER/LAWYER do NOT throw", () => {
  assert.doesNotThrow(() => assertCanManageDeadlines(admin));
  assert.doesNotThrow(() => assertCanManageDeadlines(partner));
  assert.doesNotThrow(() => assertCanManageDeadlines(lawyer));
});

test("assertCanManageDeadlines: TRAINEE/INTERN/null throw (liability gate)", () => {
  const expected = { message: "Nemáte oprávnění spravovat lhůty." };
  assert.throws(() => assertCanManageDeadlines(trainee), expected);
  assert.throws(() => assertCanManageDeadlines(intern), expected);
  assert.throws(() => assertCanManageDeadlines(null), expected);
});

// --- deadlineVisibilityWhere: case-derived, fail-closed ---
test("deadlineVisibilityWhere: missing org → fail-closed deny clause", () => {
  const noOrg = { id: "u-x", role: UserRole.LAWYER };
  assert.deepEqual(deadlineVisibilityWhere(noOrg), { id: "__role_denied__" });
  assert.deepEqual(deadlineVisibilityWhere(null), { id: "__role_denied__" });
});

test("deadlineVisibilityWhere: ADMIN/PARTNER see all deadlines in their org", () => {
  assert.deepEqual(deadlineVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(deadlineVisibilityWhere(partner), { organizationId: org });
});

test("deadlineVisibilityWhere: LAWYER scoped to own + responsible/assigned-case deadlines", () => {
  const expected = {
    AND: [
      { organizationId: org },
      {
        OR: [
          { responsibleUserId: "u-lawyer" },
          { createdById: "u-lawyer" },
          { case: { is: { responsibleUserId: "u-lawyer" } } },
          { case: { is: { project: { is: { responsibleUserId: "u-lawyer" } } } } },
          { case: { is: { assignees: { some: { userId: "u-lawyer" } } } } },
          {
            case: {
              is: { project: { is: { assignees: { some: { userId: "u-lawyer" } } } } },
            },
          },
          { case: { is: { teamAssignments: { some: teamMember("u-lawyer") } } } },
          {
            case: {
              is: {
                project: { is: { teamAssignments: { some: teamMember("u-lawyer") } } },
              },
            },
          },
        ],
      },
    ],
  };
  assert.deepEqual(deadlineVisibilityWhere(lawyer), expected);
});

test("deadlineVisibilityWhere: TRAINEE/INTERN see only own (responsible/created)", () => {
  const expectedFor = (id: string) => ({
    AND: [
      { organizationId: org },
      { OR: [{ responsibleUserId: id }, { createdById: id }] },
    ],
  });
  assert.deepEqual(deadlineVisibilityWhere(trainee), expectedFor("u-trainee"));
  assert.deepEqual(deadlineVisibilityWhere(intern), expectedFor("u-intern"));
});

// --- courtHearingVisibilityWhere: same case-derived rules as deadlines ---
test("courtHearingVisibilityWhere: missing org → fail-closed deny clause", () => {
  assert.deepEqual(courtHearingVisibilityWhere(null), { id: "__role_denied__" });
});

test("courtHearingVisibilityWhere: ADMIN org-wide; LAWYER scoped", () => {
  assert.deepEqual(courtHearingVisibilityWhere(admin), { organizationId: org });
  const lawyerWhere = courtHearingVisibilityWhere(lawyer) as {
    AND?: Array<{ organizationId?: string; OR?: unknown[] }>;
  };
  assert.deepEqual(lawyerWhere.AND?.[0], { organizationId: org });
  // 4 responsibility paths + 2 case/project assignee + 2 team mirrors.
  assert.equal(lawyerWhere.AND?.[1]?.OR?.length, 8);
});

// --- F5 documents: management gates + visibility ---
test("canManageDocuments: ADMIN/PARTNER/LAWYER true, juniors/null false", () => {
  assert.equal(canManageDocuments(admin), true);
  assert.equal(canManageDocuments(partner), true);
  assert.equal(canManageDocuments(lawyer), true);
  assert.equal(canManageDocuments(trainee), false);
  assert.equal(canManageDocuments(intern), false);
  assert.equal(canManageDocuments(null), false);
});

test("canManageDocumentTemplates: only ADMIN/PARTNER (office-wide asset)", () => {
  assert.equal(canManageDocumentTemplates(admin), true);
  assert.equal(canManageDocumentTemplates(partner), true);
  assert.equal(canManageDocumentTemplates(lawyer), false);
  assert.equal(canManageDocumentTemplates(trainee), false);
  assert.equal(canManageDocumentTemplates(null), false);
});

test("documentVisibilityWhere: missing org → fail-closed deny clause", () => {
  assert.deepEqual(documentVisibilityWhere(null), { id: "__role_denied__" });
  assert.deepEqual(
    documentVisibilityWhere({ id: "u-x", role: UserRole.LAWYER }),
    { id: "__role_denied__" },
  );
});

test("documentVisibilityWhere: ADMIN/PARTNER org-wide; TRAINEE/INTERN own-only", () => {
  assert.deepEqual(documentVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(documentVisibilityWhere(partner), { organizationId: org });
  assert.deepEqual(documentVisibilityWhere(trainee), {
    AND: [{ organizationId: org }, { createdById: "u-trainee" }],
  });
  assert.deepEqual(documentVisibilityWhere(intern), {
    AND: [{ organizationId: org }, { createdById: "u-intern" }],
  });
});

test("documentVisibilityWhere: LAWYER OR covers created + case + assignee + subject branches", () => {
  const where = documentVisibilityWhere(lawyer) as {
    AND?: Array<{ organizationId?: string; OR?: unknown[] }>;
  };
  assert.deepEqual(where.AND?.[0], { organizationId: org });
  // created + case-responsible + case-project-responsible + case-assignee +
  // case-project-assignee + 2 team mirrors + subject-visible
  assert.equal(where.AND?.[1]?.OR?.length, 8);
});

test("documentTemplateVisibilityWhere: org-scoped read, fail-closed without org", () => {
  assert.deepEqual(documentTemplateVisibilityWhere(admin), {
    organizationId: org,
  });
  assert.deepEqual(documentTemplateVisibilityWhere(lawyer), {
    organizationId: org,
  });
  assert.deepEqual(documentTemplateVisibilityWhere(null), {
    id: "__role_denied__",
  });
});

// --- canViewRecord: the per-record read gate ---
test("canViewRecord: ADMIN sees any non-null record", () => {
  assert.equal(canViewRecord(admin, "Task", {}), true);
  assert.equal(canViewRecord(admin, "WorkLog", { userId: "someone-else" }), true);
});

test("canViewRecord: null record is never viewable", () => {
  assert.equal(canViewRecord(admin, "Task", null), false);
  assert.equal(canViewRecord(lawyer, "Task", null), false);
});

test("canViewRecord: default scope ALL → any task/project/case of the office", () => {
  for (const user of [lawyer, trainee, intern]) {
    assert.equal(canViewRecord(user, "Task", { assignedToId: "other" }), true);
    assert.equal(canViewRecord(user, "Project", { responsibleUserId: "other" }), true);
    assert.equal(canViewRecord(user, "Case", { responsibleUserId: "other" }), true);
    assert.equal(canViewRecord(user, "Subject", { id: "s" }), true);
    // Org isolation still applies first.
    assert.equal(
      canViewRecord(user, "Task", { organizationId: "org-2", assignedToId: user.id }),
      false,
    );
  }
});

test("canViewRecord: ASSIGNED scope sees own task and responsible project's task", () => {
  const narrowed = withOverrides(lawyer, ASSIGNED_MATTERS);
  assert.equal(canViewRecord(narrowed, "Task", { assignedToId: "u-lawyer" }), true);
  assert.equal(canViewRecord(narrowed, "Task", { assignedToId: "other" }), false);
  assert.equal(
    canViewRecord(narrowed, "Task", { project: { responsibleUserId: "u-lawyer" } }),
    true,
  );
  assert.equal(canViewRecord(narrowed, "Project", { responsibleUserId: "other" }), false);
});

test("canViewRecord: WorkLog visible only to its owner (non-senior)", () => {
  assert.equal(canViewRecord(intern, "WorkLog", { userId: "u-intern" }), true);
  assert.equal(canViewRecord(intern, "WorkLog", { userId: "other" }), false);
});

// --- canEditRecord: the per-record write gate (stricter than view) ---
test("canEditRecord: ADMIN/PARTNER may edit anything", () => {
  assert.equal(canEditRecord(admin, "Project", { responsibleUserId: "x" }), true);
  assert.equal(canEditRecord(partner, "Case", { responsibleUserId: "x" }), true);
});

test("canEditRecord: LAWYER edits own project/case, not others'", () => {
  assert.equal(canEditRecord(lawyer, "Project", { responsibleUserId: "u-lawyer" }), true);
  assert.equal(canEditRecord(lawyer, "Project", { responsibleUserId: "other" }), false);
  assert.equal(canEditRecord(lawyer, "Case", { responsibleUserId: "u-lawyer" }), true);
});

test("canEditRecord: TRAINEE cannot edit a project even when responsible", () => {
  // Only LAWYER (and senior) may edit projects/cases — a trainee never can.
  assert.equal(canEditRecord(trainee, "Project", { responsibleUserId: "u-trainee" }), false);
});

test("canEditRecord: WorkLog editable only by its author", () => {
  assert.equal(canEditRecord(intern, "WorkLog", { userId: "u-intern" }), true);
  assert.equal(canEditRecord(intern, "WorkLog", { userId: "other" }), false);
});

test("canEditRecord: Task edit needs DIRECT access, not mere responsibility", () => {
  assert.equal(canEditRecord(lawyer, "Task", { createdById: "u-lawyer" }), true);
  assert.equal(
    canEditRecord(lawyer, "Task", { project: { responsibleUserId: "u-lawyer" } }),
    false,
  );
});

test("canEditRecord: null record never editable", () => {
  assert.equal(canEditRecord(admin, "Task", null), false);
});

// --- canManagePortal / assertCanManagePortal (F6 CLIENT_PORTAL) ---
// Granting an external party access to confidential case data is a case-handling
// decision: ADMIN/PARTNER/LAWYER may do it, TRAINEE/INTERN may not. The gate is
// role-only (no org dependency), so a missing/garbage role must fail closed —
// otherwise a malformed caller could share privileged client data.
test("canManagePortal: ADMIN/PARTNER/LAWYER true, TRAINEE/INTERN false", () => {
  assert.equal(canManagePortal(admin), true);
  assert.equal(canManagePortal(partner), true);
  assert.equal(canManagePortal(lawyer), true);
  assert.equal(canManagePortal(trainee), false);
  assert.equal(canManagePortal(intern), false);
});

test("canManagePortal: no role / no org / null / undefined → false (fail closed)", () => {
  // Caller with an id but no role must not be able to expose data to clients.
  assert.equal(canManagePortal({ id: "u-x", role: undefined as never }), false);
  // Role-less even when org-less: portal management depends on the role only.
  assert.equal(canManagePortal({ id: "u-y", role: undefined as never }), false);
  assert.equal(canManagePortal(null), false);
  assert.equal(canManagePortal(undefined), false);
});

test("assertCanManagePortal: ADMIN/PARTNER/LAWYER do NOT throw", () => {
  assert.doesNotThrow(() => assertCanManagePortal(admin));
  assert.doesNotThrow(() => assertCanManagePortal(partner));
  assert.doesNotThrow(() => assertCanManagePortal(lawyer));
});

test("assertCanManagePortal: TRAINEE/INTERN/null/undefined throw (data-exposure gate)", () => {
  const expected = { message: "Nemáte oprávnění spravovat klientský portál." };
  assert.throws(() => assertCanManagePortal(trainee), expected);
  assert.throws(() => assertCanManagePortal(intern), expected);
  assert.throws(() => assertCanManagePortal(null), expected);
  assert.throws(() => assertCanManagePortal(undefined), expected);
});

// --- HR / Docházka (F7): personal/payroll data restricted to ADMIN/PARTNER ---
// HR holds sensitive personal data (payroll, absences, sickness). Management
// (employee records, approvals, payroll export) is the HR-manager gate; regular
// employees may only see/request their OWN records via the visibility helpers.
test("canManageHr: ADMIN/PARTNER true, juniors false", () => {
  assert.equal(canManageHr(admin), true);
  assert.equal(canManageHr(partner), true);
  assert.equal(canManageHr(lawyer), false);
  assert.equal(canManageHr(trainee), false);
  assert.equal(canManageHr(intern), false);
});

test("canManageHr: no role / org-less / null / undefined → false (fail closed)", () => {
  // A caller carrying only an id but no role must not pass the HR gate.
  assert.equal(canManageHr({ id: "u-x", role: undefined as never }), false);
  // Role present but org-less: HR management depends only on the senior role,
  // and a junior role stays denied regardless of org.
  assert.equal(canManageHr({ id: "u-y", role: UserRole.LAWYER }), false);
  assert.equal(canManageHr(null), false);
  assert.equal(canManageHr(undefined), false);
});

test("assertCanManageHr: ADMIN/PARTNER do NOT throw", () => {
  assert.doesNotThrow(() => assertCanManageHr(admin));
  assert.doesNotThrow(() => assertCanManageHr(partner));
});

test("assertCanManageHr: juniors/null/undefined throw (personal-data gate)", () => {
  const expected = { message: "Nemáte oprávnění spravovat HR a docházku." };
  assert.throws(() => assertCanManageHr(lawyer), expected);
  assert.throws(() => assertCanManageHr(trainee), expected);
  assert.throws(() => assertCanManageHr(intern), expected);
  assert.throws(() => assertCanManageHr(null), expected);
  assert.throws(() => assertCanManageHr(undefined), expected);
});

// --- hrEmployeeVisibilityWhere: managers org-wide, others only own record ---
test("hrEmployeeVisibilityWhere: ADMIN/PARTNER see all employees in their org", () => {
  assert.deepEqual(hrEmployeeVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(hrEmployeeVisibilityWhere(partner), { organizationId: org });
});

test("hrEmployeeVisibilityWhere: juniors scoped to their own employee row (userId)", () => {
  assert.deepEqual(hrEmployeeVisibilityWhere(lawyer), {
    AND: [{ organizationId: org }, { userId: "u-lawyer" }],
  });
  assert.deepEqual(hrEmployeeVisibilityWhere(trainee), {
    AND: [{ organizationId: org }, { userId: "u-trainee" }],
  });
  assert.deepEqual(hrEmployeeVisibilityWhere(intern), {
    AND: [{ organizationId: org }, { userId: "u-intern" }],
  });
});

test("hrEmployeeVisibilityWhere: missing org → fail-closed deny clause", () => {
  // Role-only and org-less callers must never reach another org's HR data.
  const noOrg = { id: "u-x", role: UserRole.LAWYER };
  assert.deepEqual(hrEmployeeVisibilityWhere(noOrg), { id: "__role_denied__" });
  assert.deepEqual(hrEmployeeVisibilityWhere(null), { id: "__role_denied__" });
  assert.deepEqual(hrEmployeeVisibilityWhere(undefined), { id: "__role_denied__" });
});

test("hrEmployeeVisibilityWhere: org present but no userId → deny (can't self-scope)", () => {
  // A string role carries an org clause path of null, but a user object with an
  // org yet no id cannot be self-scoped, so it must fail closed rather than leak.
  assert.deepEqual(
    hrEmployeeVisibilityWhere({ id: "" as never, role: UserRole.INTERN, organizationId: org }),
    { id: "__role_denied__" },
  );
});

// --- hrAttendanceVisibilityWhere: derived from employee.userId ---
test("hrAttendanceVisibilityWhere: ADMIN/PARTNER org-wide", () => {
  assert.deepEqual(hrAttendanceVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(hrAttendanceVisibilityWhere(partner), { organizationId: org });
});

test("hrAttendanceVisibilityWhere: juniors only rows for their own employee", () => {
  assert.deepEqual(hrAttendanceVisibilityWhere(lawyer), {
    AND: [{ organizationId: org }, { employee: { is: { userId: "u-lawyer" } } }],
  });
  assert.deepEqual(hrAttendanceVisibilityWhere(trainee), {
    AND: [{ organizationId: org }, { employee: { is: { userId: "u-trainee" } } }],
  });
  assert.deepEqual(hrAttendanceVisibilityWhere(intern), {
    AND: [{ organizationId: org }, { employee: { is: { userId: "u-intern" } } }],
  });
});

test("hrAttendanceVisibilityWhere: missing org → fail-closed deny clause", () => {
  const noOrg = { id: "u-x", role: UserRole.TRAINEE };
  assert.deepEqual(hrAttendanceVisibilityWhere(noOrg), { id: "__role_denied__" });
  assert.deepEqual(hrAttendanceVisibilityWhere(null), { id: "__role_denied__" });
  assert.deepEqual(hrAttendanceVisibilityWhere(undefined), { id: "__role_denied__" });
});

// --- hrAbsenceVisibilityWhere: same employee-derived rule as attendance ---
test("hrAbsenceVisibilityWhere: ADMIN/PARTNER org-wide", () => {
  assert.deepEqual(hrAbsenceVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(hrAbsenceVisibilityWhere(partner), { organizationId: org });
});

test("hrAbsenceVisibilityWhere: juniors only their own absence requests", () => {
  assert.deepEqual(hrAbsenceVisibilityWhere(lawyer), {
    AND: [{ organizationId: org }, { employee: { is: { userId: "u-lawyer" } } }],
  });
  assert.deepEqual(hrAbsenceVisibilityWhere(intern), {
    AND: [{ organizationId: org }, { employee: { is: { userId: "u-intern" } } }],
  });
});

test("hrAbsenceVisibilityWhere: missing org → fail-closed deny clause", () => {
  const noOrg = { id: "u-x", role: UserRole.INTERN };
  assert.deepEqual(hrAbsenceVisibilityWhere(noOrg), { id: "__role_denied__" });
  assert.deepEqual(hrAbsenceVisibilityWhere(null), { id: "__role_denied__" });
  assert.deepEqual(hrAbsenceVisibilityWhere(undefined), { id: "__role_denied__" });
});

// --- Multi-assignee visibility: assignee mirrors responsibleUser on Project/Case ---
function orBranches(where: unknown): unknown[] {
  const and = (where as { AND?: Array<{ OR?: unknown[] }> }).AND;
  return and?.[1]?.OR ?? [];
}

test("projectVisibilityWhere: ASSIGNED scope OR adds direct + via-case assignee mirrors", () => {
  for (const user of [lawyer, trainee, intern]) {
    const branches = orBranches(projectVisibilityWhere(withOverrides(user, ASSIGNED_MATTERS)));
    assert.equal(branches.length, 8);
    assert.ok(
      branches.some(
        (b) => JSON.stringify(b) === JSON.stringify({ assignees: { some: { userId: user.id } } }),
      ),
    );
  }
});

test("caseVisibilityWhere: ASSIGNED scope gains case + project-assignee paths", () => {
  assert.equal(orBranches(caseVisibilityWhere(withOverrides(lawyer, ASSIGNED_MATTERS))).length, 8);
  assert.equal(orBranches(caseVisibilityWhere(withOverrides(intern, ASSIGNED_MATTERS))).length, 8);
});

test("workLogVisibilityWhere: LAWYER OR mirrors assignee on project/case", () => {
  assert.equal(orBranches(workLogVisibilityWhere(lawyer)).length, 11);
});

test("billingApproverWorkLogWhere covers direct, project, and case client", () => {
  const where = billingApproverWorkLogWhere("u-approver");
  assert.equal(where.OR?.length, 3);
  assert.match(JSON.stringify(where), /billingApprovers/);
  assert.match(JSON.stringify(where), /u-approver/);
});

test("invoiceVisibilityWhere: LAWYER gains assignee paths; juniors stay created-only", () => {
  // 5 responsibility/ownership paths + 3 assignee + 3 team mirrors
  // (project/case/case→project).
  assert.equal(orBranches(invoiceVisibilityWhere(lawyer)).length, 11);
  // Sensitive billing data must NOT widen for juniors — created-only fallback.
  assert.deepEqual(invoiceVisibilityWhere(trainee), {
    AND: [{ organizationId: org }, { createdById: "u-trainee" }],
  });
  assert.deepEqual(invoiceVisibilityWhere(intern), {
    AND: [{ organizationId: org }, { createdById: "u-intern" }],
  });
});

// --- Granular per-user capabilities (grants beyond role) ---
const lawyerWithInvoices = {
  id: "u-lawyer",
  role: UserRole.LAWYER,
  organizationId: org,
  capabilities: [Capability.MANAGE_INVOICES],
};
const traineeWithRates = {
  id: "u-trainee",
  role: UserRole.TRAINEE,
  organizationId: org,
  capabilities: [Capability.VIEW_RATES],
};

test("hasCapability: true only when grant present; fail-closed otherwise", () => {
  assert.equal(hasCapability(lawyerWithInvoices, Capability.MANAGE_INVOICES), true);
  assert.equal(hasCapability(lawyerWithInvoices, Capability.VIEW_RATES), false);
  // role-only object / string role / null / missing field → false
  assert.equal(hasCapability(lawyer, Capability.MANAGE_INVOICES), false);
  assert.equal(hasCapability(UserRole.LAWYER, Capability.MANAGE_INVOICES), false);
  assert.equal(hasCapability(null, Capability.MANAGE_INVOICES), false);
});

test("canViewRates: ADMIN/PARTNER by role; others only with VIEW_RATES grant", () => {
  assert.equal(canViewRates(admin), true);
  assert.equal(canViewRates(partner), true);
  assert.equal(canViewRates(lawyer), false);
  assert.equal(canViewRates(trainee), false);
  assert.equal(canViewRates(intern), false);
  assert.equal(canViewRates(traineeWithRates), true);
});

test("canManageInvoices: ADMIN/PARTNER by role; LAWYER only with MANAGE_INVOICES grant", () => {
  assert.equal(canManageInvoices(admin), true);
  assert.equal(canManageInvoices(partner), true);
  // Default tightened (revize ř.77): a bare LAWYER no longer manages invoices.
  assert.equal(canManageInvoices(lawyer), false);
  assert.equal(canManageInvoices(lawyerWithInvoices), true);
  assert.equal(canManageInvoices(trainee), false);
  assert.equal(canManageInvoices(null), false);
});

test("assertCanManageInvoices: throws without role/grant, passes with grant", () => {
  assert.doesNotThrow(() => assertCanManageInvoices(admin));
  assert.doesNotThrow(() => assertCanManageInvoices(lawyerWithInvoices));
  const expected = { message: "Nemáte oprávnění spravovat faktury." };
  assert.throws(() => assertCanManageInvoices(lawyer), expected);
  assert.throws(() => assertCanManageInvoices(trainee), expected);
  assert.throws(() => assertCanManageInvoices(UserRole.LAWYER), expected);
});

test("canViewRecord: ASSIGNED scope sees a project/case the user is assigned to", () => {
  const narrowedLawyer = withOverrides(lawyer, ASSIGNED_MATTERS);
  const narrowedIntern = withOverrides(intern, ASSIGNED_MATTERS);
  assert.equal(
    canViewRecord(narrowedLawyer, "Project", { assignees: [{ userId: "u-lawyer" }] }),
    true,
  );
  assert.equal(
    canViewRecord(narrowedIntern, "Project", { assignees: [{ userId: "u-intern" }] }),
    true,
  );
  assert.equal(
    canViewRecord(narrowedIntern, "Project", { assignees: [{ userId: "other" }] }),
    false,
  );
  // A case is visible to an assignee of its parent project too.
  assert.equal(
    canViewRecord(narrowedIntern, "Case", { project: { assignees: [{ userId: "u-intern" }] } }),
    true,
  );
});

test("canEditRecord: LAWYER assignee may edit project/case; TRAINEE assignee may not", () => {
  assert.equal(
    canEditRecord(lawyer, "Project", { assignees: [{ userId: "u-lawyer" }] }),
    true,
  );
  assert.equal(
    canEditRecord(lawyer, "Case", { assignees: [{ userId: "u-lawyer" }] }),
    true,
  );
  // Edit stays LAWYER-only — a trainee assignee can view but never edit.
  assert.equal(
    canEditRecord(trainee, "Case", { assignees: [{ userId: "u-trainee" }] }),
    false,
  );
  // Project-assignee does NOT cascade to editing the project's cases (mirrors
  // that a project-responsible user can't edit its cases either).
  assert.equal(
    canEditRecord(lawyer, "Case", { project: { assignees: [{ userId: "u-lawyer" }] } }),
    false,
  );
});

// --- Regressions of the permission matrix --------------------------------------

test("LAWYER documents stay ASSIGNED even though subjects default to ALL (no spill-over)", () => {
  const where = documentVisibilityWhere(lawyer) as {
    AND?: Array<{ organizationId?: string; OR?: Array<Record<string, unknown>> }>;
  };
  assert.deepEqual(where.AND?.[0], { organizationId: org });
  const subjectBranch = where.AND?.[1]?.OR?.find((branch) => "subject" in branch) as {
    subject: { is: unknown };
  };
  assert.ok(subjectBranch, "subject branch present");
  // The subject branch must be the assigned-subject builder, not the (ALL)
  // subjectVisibilityWhere — i.e. never just { organizationId }.
  assert.notDeepEqual(subjectBranch.subject.is, { organizationId: org });
  assert.match(JSON.stringify(subjectBranch.subject.is), /u-lawyer/);
});

test("canEditRecord: TRAINEE can't edit someone else's project, an override grants it", () => {
  const foreign = { responsibleUserId: "other" };
  assert.equal(canEditRecord(trainee, "Project", foreign), false);
  assert.equal(canEditRecord(trainee, "Case", foreign), false);
  assert.equal(canEditRecord(trainee, "Task", { assignedToId: "other" }), false);
  const granted = withOverrides(trainee, [], [
    { permission: "function.editAllMatters", value: "ALLOW" },
  ]);
  assert.equal(canEditRecord(granted, "Project", foreign), true);
  assert.equal(canEditRecord(granted, "Case", foreign), true);
  assert.equal(canEditRecord(granted, "Task", { assignedToId: "other" }), true);
  // Work-logs are a separate function.
  assert.equal(canEditRecord(granted, "WorkLog", { userId: "other" }), false);
});

test("canEditRecord: denying editAllMatters to PARTNER limits them to their own matters", () => {
  const limited = withOverrides(partner, [
    { permission: "function.editAllMatters", value: "DENY" },
  ]);
  assert.equal(canEditRecord(limited, "Project", { responsibleUserId: "other" }), false);
  assert.equal(canEditRecord(limited, "Project", { responsibleUserId: "u-partner" }), true);
});

test("assertCanAdministerOrg: manageOrganization only within the user's own org", () => {
  assert.doesNotThrow(() => assertCanAdministerOrg(partner, org));
  assert.throws(() => assertCanAdministerOrg(partner, "org-2"));
  assert.throws(() => assertCanAdministerOrg(lawyer, org));
  const granted = withOverrides(lawyer, [], [
    { permission: "function.manageOrganization", value: "ALLOW" },
  ]);
  assert.doesNotThrow(() => assertCanAdministerOrg(granted, org));
  assert.throws(() => assertCanAdministerOrg(granted, "org-2"));
  assert.doesNotThrow(() =>
    assertCanAdministerOrg({ id: "p", role: UserRole.LAWYER, isPlatformAdmin: true }, "org-2"),
  );
});

test("ADMIN can't be locked out by overrides", () => {
  const admined = withOverrides(admin, [
    { permission: "function.managePermissions", value: "DENY" },
    { permission: "scope.tasks", value: "ASSIGNED" },
  ]);
  assert.equal(canManagePermissions(admined), true);
  assert.deepEqual(taskVisibilityWhere(admined), { organizationId: org });
});

test("tightening a role's module or rate permission takes effect in helpers", () => {
  const ratesForIntern = withOverrides(intern, [
    { permission: "function.viewRates", value: "ALLOW" },
  ]);
  assert.equal(canViewRates(ratesForIntern), true);
  assert.equal(canViewRates(intern), false);
  const noRatesPartner = withOverrides(partner, [
    { permission: "function.viewRates", value: "DENY" },
  ]);
  assert.equal(canViewRates(noRatesPartner), false);
});

// --- Ochrana před eskalací přes správu uživatelů -------------------------------

const roleTarget = (role: UserRole, roleOverrides: Array<{ permission: string; value: string }> = []) => ({
  role,
  permissions: resolvePermissions({ role, roleOverrides }),
});

test("privilegedTargetDenial: a non-admin with manageUsers can't create or take over an ADMIN", () => {
  // Koncipient, kterému partner v matici přidal „Spravuje uživatele“.
  const userManager = withOverrides(trainee, [
    { permission: "function.manageUsers", value: "ALLOW" },
  ]);
  assert.equal(canManageUsers(userManager), true);
  for (const action of ["assignRole", "resetPassword", "deactivate"] as const) {
    assert.ok(privilegedTargetDenial(userManager, roleTarget(UserRole.ADMIN), action));
    assert.ok(privilegedTargetDenial(partner, roleTarget(UserRole.ADMIN), action));
    // Partner by default holds managePermissions → can't be taken over either.
    assert.ok(privilegedTargetDenial(userManager, roleTarget(UserRole.PARTNER), action));
    // Ordinary roles stay manageable.
    assert.equal(privilegedTargetDenial(userManager, roleTarget(UserRole.LAWYER), action), null);
    assert.equal(privilegedTargetDenial(userManager, roleTarget(UserRole.INTERN), action), null);
  }
  assert.equal(
    privilegedTargetDenial(userManager, roleTarget(UserRole.ADMIN), "resetPassword"),
    "Heslo administrátora může změnit jen administrátor.",
  );
  assert.equal(
    privilegedTargetDenial(partner, roleTarget(UserRole.ADMIN), "assignRole"),
    "Roli Administrátor může přidělit nebo odebrat jen administrátor.",
  );
});

test("privilegedTargetDenial: managePermissions holders may act on peers, admins on anyone", () => {
  // Partner (managePermissions by default) may still create/promote partners.
  assert.equal(privilegedTargetDenial(partner, roleTarget(UserRole.PARTNER), "assignRole"), null);
  // A Lawyer whose role was given managePermissions is protected from a
  // manageUsers-only actor.
  const userManager = withOverrides(lawyer, [], [
    { permission: "function.manageUsers", value: "ALLOW" },
  ]);
  const lawyerWithMatrix = roleTarget(UserRole.LAWYER, [
    { permission: "function.managePermissions", value: "ALLOW" },
  ]);
  assert.ok(privilegedTargetDenial(userManager, lawyerWithMatrix, "resetPassword"));
  // A Partner whose managePermissions was revoked is an ordinary target.
  const plainPartner = roleTarget(UserRole.PARTNER, [
    { permission: "function.managePermissions", value: "DENY" },
  ]);
  assert.equal(privilegedTargetDenial(userManager, plainPartner, "resetPassword"), null);
  // ADMIN and the platform admin are never limited.
  assert.equal(privilegedTargetDenial(admin, roleTarget(UserRole.ADMIN), "resetPassword"), null);
  assert.equal(
    privilegedTargetDenial(
      { id: "p", role: UserRole.LAWYER, isPlatformAdmin: true },
      roleTarget(UserRole.ADMIN),
      "assignRole",
    ),
    null,
  );
  // Fail closed for an unknown actor.
  assert.ok(privilegedTargetDenial(null, roleTarget(UserRole.ADMIN), "assignRole"));
  assert.ok(privilegedTargetDenial(null, roleTarget(UserRole.PARTNER), "assignRole"));
});

// --- Týmy jako řešitelé (balík 04): ASSIGNED scope zahrnuje členy týmů ---

function hasBranch(branches: unknown[], expected: unknown) {
  return branches.some((b) => JSON.stringify(b) === JSON.stringify(expected));
}

test("projectVisibilityWhere ASSIGNED: team path on the project and via its cases", () => {
  for (const user of [lawyer, trainee, intern]) {
    const branches = orBranches(
      projectVisibilityWhere(withOverrides(user, ASSIGNED_MATTERS)),
    );
    assert.ok(hasBranch(branches, { teamAssignments: { some: teamMember(user.id) } }));
    assert.ok(
      hasBranch(branches, {
        cases: { some: { teamAssignments: { some: teamMember(user.id) } } },
      }),
    );
  }
});

test("caseVisibilityWhere ASSIGNED: team of the case and team of its project", () => {
  for (const user of [lawyer, trainee, intern]) {
    const branches = orBranches(
      caseVisibilityWhere(withOverrides(user, ASSIGNED_MATTERS)),
    );
    assert.ok(hasBranch(branches, { teamAssignments: { some: teamMember(user.id) } }));
    assert.ok(
      hasBranch(branches, {
        project: { is: { teamAssignments: { some: teamMember(user.id) } } },
      }),
    );
  }
});

test("task/workLog/reference/invoice ASSIGNED: 3 team mirrors (project, case, case→project)", () => {
  const scopes = [
    { permission: "scope.tasks", value: "ASSIGNED" },
    { permission: "scope.workLogs", value: "ASSIGNED" },
    { permission: "scope.references", value: "ASSIGNED" },
    { permission: "scope.invoices", value: "ASSIGNED" },
  ];
  const user = withOverrides(intern, scopes);
  const team = { teamAssignments: { some: teamMember(intern.id) } };
  for (const where of [
    taskVisibilityWhere(user),
    workLogVisibilityWhere(user),
    referenceVisibilityWhere(user),
    invoiceVisibilityWhere(user),
  ]) {
    const branches = orBranches(where);
    assert.ok(hasBranch(branches, { project: { is: team } }));
    assert.ok(hasBranch(branches, { case: { is: team } }));
    assert.ok(hasBranch(branches, { case: { is: { project: { is: team } } } }));
  }
});

test("dataMessage/deadline/courtHearing/document ASSIGNED: case + case→project team mirrors", () => {
  const scopes = [
    { permission: "scope.dataMessages", value: "ASSIGNED" },
    { permission: "scope.deadlines", value: "ASSIGNED" },
    { permission: "scope.documents", value: "ASSIGNED" },
  ];
  const user = withOverrides(trainee, scopes);
  const team = { teamAssignments: { some: teamMember(trainee.id) } };
  for (const where of [
    dataMessageVisibilityWhere(user),
    deadlineVisibilityWhere(user),
    courtHearingVisibilityWhere(user),
    documentVisibilityWhere(user),
  ]) {
    const branches = orBranches(where);
    assert.ok(hasBranch(branches, { case: { is: team } }));
    assert.ok(hasBranch(branches, { case: { is: { project: { is: team } } } }));
  }
});

test("subjectVisibilityWhere ASSIGNED: client of a project assigned to the user's team", () => {
  const where = subjectVisibilityWhere(withOverrides(intern, ASSIGNED_MATTERS));
  const branches = orBranches(where) as Array<{
    mainProjects?: { some?: { AND?: Array<{ OR?: unknown[] }> } };
  }>;
  const mainProjects = branches.find((b) => b.mainProjects)?.mainProjects;
  const projectBranches = mainProjects?.some?.AND?.[1]?.OR ?? [];
  assert.ok(
    hasBranch(projectBranches, { teamAssignments: { some: teamMember(intern.id) } }),
  );
});

test("team scope keeps ALL = whole office and denies without an org", () => {
  assert.deepEqual(projectVisibilityWhere(intern), { organizationId: org });
  assert.deepEqual(caseVisibilityWhere(lawyer), { organizationId: org });
  const orgless = { id: "u-x", role: UserRole.INTERN };
  assert.deepEqual(projectVisibilityWhere(orgless), { id: "__role_denied__" });
});

const teamWith = (userIds: string[], archivedAt: Date | null = null) => ({
  legalTeam: { archivedAt, members: userIds.map((userId) => ({ userId })) },
});

test("canViewRecord: member of an assigned team sees the project, case and task", () => {
  const narrowed = withOverrides(intern, ASSIGNED_MATTERS);
  const project = { teamAssignments: [teamWith(["u-intern", "u-lawyer"])] };
  assert.equal(canViewRecord(narrowed, "Project", project), true);
  assert.equal(canViewRecord(narrowed, "Case", { teamAssignments: project.teamAssignments }), true);
  // Případ vidí i člen týmu projektu.
  assert.equal(canViewRecord(narrowed, "Case", { project }), true);
  assert.equal(canViewRecord(narrowed, "Task", { case: { project } }), true);
  assert.equal(canViewRecord(narrowed, "Task", { project }), true);
});

test("canViewRecord: another team, an archived team or missing rows give no access", () => {
  const narrowed = withOverrides(intern, ASSIGNED_MATTERS);
  assert.equal(
    canViewRecord(narrowed, "Project", { teamAssignments: [teamWith(["u-lawyer"])] }),
    false,
  );
  assert.equal(
    canViewRecord(narrowed, "Project", {
      teamAssignments: [teamWith(["u-intern"], new Date())],
    }),
    false,
  );
  assert.equal(canViewRecord(narrowed, "Project", {}), false);
  assert.equal(canViewRecord(narrowed, "Project", { teamAssignments: null }), false);
});

test("canEditRecord: LAWYER in the project's team edits it; TRAINEE in the team does not", () => {
  const project = { teamAssignments: [teamWith(["u-lawyer", "u-trainee"])] };
  assert.equal(canEditRecord(lawyer, "Project", project), true);
  assert.equal(canEditRecord(trainee, "Project", project), false);
  assert.equal(canEditRecord(lawyer, "Case", { teamAssignments: project.teamAssignments }), true);
  // Tým projektu nedává editaci případu (zrcadlí přímého řešitele projektu).
  assert.equal(canEditRecord(lawyer, "Case", { project }), false);
  // Bez načtených týmových přiřazení fail-closed.
  assert.equal(canEditRecord(lawyer, "Project", { assignees: [] }), false);
  assert.equal(
    canEditRecord(lawyer, "Project", {
      teamAssignments: [teamWith(["u-lawyer"], new Date())],
    }),
    false,
  );
});

test("canManageTeams / canBulkAssign / canOpenAssignments follow the default matrix", () => {
  for (const user of [admin, partner]) {
    assert.equal(canManageTeams(user), true);
    assert.equal(canBulkAssign(user), true);
    assert.equal(canOpenAssignments(user), true);
  }
  for (const user of [lawyer, trainee, intern]) {
    assert.equal(canManageTeams(user), false);
    assert.equal(canBulkAssign(user), false);
    assert.equal(canOpenAssignments(user), false);
  }
  assert.equal(canBulkAssign({ id: "u-x", role: UserRole.ADMIN }), false);
  assert.equal(canOpenAssignments(null), false);
});

test("canBulkAssign: a LAWYER with editAllMatters may bulk-assign, but not manage teams", () => {
  const widened = withOverrides(lawyer, [
    { permission: "function.editAllMatters", value: "ALLOW" },
  ]);
  assert.equal(canBulkAssign(widened), true);
  assert.equal(canManageTeams(widened), false);
  assert.equal(canOpenAssignments(widened), true);
  const manager = withOverrides(trainee, [
    { permission: "function.manageOrganization", value: "ALLOW" },
  ]);
  assert.equal(canManageTeams(manager), true);
  assert.equal(canBulkAssign(manager), false);
  assert.equal(canOpenAssignments(manager), true);
});

// --- Lidé na úkolu: další řešitelé a dohled ----------------------------------

const supervisorRow = (userId: string) => ({ userId, role: "SUPERVISOR" });
const assigneeRow = (userId: string) => ({ userId, role: "ASSIGNEE" });

test("canViewRecord: ASSIGNED scope — supervisor and extra assignee rows see the task", () => {
  const narrowed = withOverrides(trainee, ASSIGNED_MATTERS);
  assert.equal(
    canViewRecord(narrowed, "Task", { assignees: [supervisorRow("u-trainee")] }),
    true,
  );
  assert.equal(
    canViewRecord(narrowed, "Task", { assignees: [assigneeRow("u-trainee")] }),
    true,
  );
  assert.equal(
    canViewRecord(narrowed, "Task", { assignees: [supervisorRow("other")] }),
    false,
  );
});

test("canEditRecord: extra assignee may edit the task, supervisor may not", () => {
  for (const user of [lawyer, trainee, intern]) {
    assert.equal(
      canEditRecord(user, "Task", {
        organizationId: org,
        assignedToId: "other",
        assignees: [assigneeRow("other"), assigneeRow(user.id)],
      }),
      true,
    );
    assert.equal(
      canEditRecord(user, "Task", {
        organizationId: org,
        assignedToId: "other",
        assignees: [supervisorRow(user.id)],
      }),
      false,
    );
  }
});

test("canWorkOnTask: supervisor may comment/change status, strangers and other orgs may not", () => {
  const task = {
    organizationId: org,
    assignedToId: "other",
    assignees: [assigneeRow("other"), supervisorRow("u-trainee")],
  };
  assert.equal(canWorkOnTask(trainee, task), true);
  assert.equal(canWorkOnTask(intern, task), false);
  assert.equal(canWorkOnTask(trainee, { ...task, organizationId: "org-2" }), false);
  assert.equal(canWorkOnTask(trainee, null), false);
  // Bez načtených řádků (fail-closed) dohled neprojde.
  assert.equal(
    canWorkOnTask(trainee, { organizationId: org, assignedToId: "other" }),
    false,
  );
  // Kdo smí upravovat, smí i pracovat (řešitel, editAllMatters).
  assert.equal(canWorkOnTask(intern, { ...task, assignedToId: "u-intern" }), true);
  assert.equal(canWorkOnTask(admin, task), true);
  const granted = withOverrides(intern, [], [
    { permission: "function.editAllMatters", value: "ALLOW" },
  ]);
  assert.equal(canWorkOnTask(granted, task), true);
  assert.throws(
    () => assertCanWorkOnTask(intern, task),
    /Nemáte oprávnění pracovat s tímto úkolem/,
  );
  assert.doesNotThrow(() => assertCanWorkOnTask(trainee, task));
});

test("projectVisibilityWhere / caseVisibilityWhere: task mirror covers task people", () => {
  const narrowed = withOverrides(lawyer, ASSIGNED_MATTERS);
  assert.match(
    JSON.stringify(projectVisibilityWhere(narrowed)),
    /"tasks":\{"some":\{"OR":\[[^\]]*"assignees":\{"some":\{"userId":"u-lawyer"\}\}/,
  );
  assert.match(
    JSON.stringify(caseVisibilityWhere(narrowed)),
    /"assignees":\{"some":\{"userId":"u-lawyer"\}\}\}\]\}\}/,
  );
});
