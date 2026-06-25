import assert from "node:assert/strict";
import { test } from "node:test";

import { UserRole } from "@/generated/prisma/enums";

import {
  andWhere,
  assertCanManageAml,
  assertCanManageDeadlines,
  assertCanManagePortal,
  canEditRecord,
  canManageAml,
  canManageDeadlines,
  canManageDocumentTemplates,
  canManageDocuments,
  canManagePortal,
  canViewAllLegalData,
  canViewRecord,
  courtHearingVisibilityWhere,
  dataMessageVisibilityWhere,
  deadlineVisibilityWhere,
  documentTemplateVisibilityWhere,
  documentVisibilityWhere,
  taskVisibilityWhere,
  workLogVisibilityWhere,
} from "./permissions";

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

// --- canViewAllLegalData: only ADMIN/PARTNER see everything ---
test("canViewAllLegalData: ADMIN and PARTNER true, others false", () => {
  assert.equal(canViewAllLegalData(admin), true);
  assert.equal(canViewAllLegalData(partner), true);
  assert.equal(canViewAllLegalData(lawyer), false);
  assert.equal(canViewAllLegalData(trainee), false);
  assert.equal(canViewAllLegalData(intern), false);
  assert.equal(canViewAllLegalData(null), false);
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

test("taskVisibilityWhere: TRAINEE/INTERN scoped to direct assignment only", () => {
  // andWhere(orgClause, directWhere) → org AND the direct-assignment OR.
  const expected = {
    AND: [
      { organizationId: org },
      {
        OR: [
          { createdById: "u-trainee" },
          { assignedToId: "u-trainee" },
          { responsibleUserId: "u-trainee" },
        ],
      },
    ],
  };
  assert.deepEqual(taskVisibilityWhere(trainee), expected);
  assert.deepEqual(taskVisibilityWhere(intern), {
    AND: [
      { organizationId: org },
      {
        OR: [
          { createdById: "u-intern" },
          { assignedToId: "u-intern" },
          { responsibleUserId: "u-intern" },
        ],
      },
    ],
  });
});

test("taskVisibilityWhere: LAWYER gets a broader OR (direct + responsibility)", () => {
  // org-scoped: { AND: [{ organizationId }, { OR: [...4 clauses] }] }.
  const where = taskVisibilityWhere(lawyer) as {
    AND?: Array<{ organizationId?: string; OR?: unknown[] }>;
  };
  assert.ok(Array.isArray(where.AND));
  assert.deepEqual(where.AND?.[0], { organizationId: org });
  const orClause = where.AND?.[1];
  assert.ok(Array.isArray(orClause?.OR));
  assert.equal(orClause?.OR?.length, 4);
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

test("dataMessageVisibilityWhere: LAWYER scoped to own + responsible-case messages", () => {
  // org-scoped: { AND: [{ organizationId }, { OR: [...3 clauses] }] }.
  const expected = {
    AND: [
      { organizationId: org },
      {
        OR: [
          { createdById: "u-lawyer" },
          { case: { is: { responsibleUserId: "u-lawyer" } } },
          { case: { is: { project: { is: { responsibleUserId: "u-lawyer" } } } } },
        ],
      },
    ],
  };
  assert.deepEqual(dataMessageVisibilityWhere(lawyer), expected);
});

test("dataMessageVisibilityWhere: LAWYER OR has exactly the 3 documented branches", () => {
  const where = dataMessageVisibilityWhere(lawyer) as {
    AND?: Array<{ organizationId?: string; OR?: unknown[] }>;
  };
  assert.ok(Array.isArray(where.AND));
  assert.deepEqual(where.AND?.[0], { organizationId: org });
  const orClause = where.AND?.[1];
  assert.ok(Array.isArray(orClause?.OR));
  assert.equal(orClause?.OR?.length, 3);
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

test("deadlineVisibilityWhere: LAWYER scoped to own + responsible-case deadlines", () => {
  const expected = {
    AND: [
      { organizationId: org },
      {
        OR: [
          { responsibleUserId: "u-lawyer" },
          { createdById: "u-lawyer" },
          { case: { is: { responsibleUserId: "u-lawyer" } } },
          { case: { is: { project: { is: { responsibleUserId: "u-lawyer" } } } } },
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
  assert.equal(lawyerWhere.AND?.[1]?.OR?.length, 4);
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

test("documentVisibilityWhere: LAWYER OR covers created + case + subject branches", () => {
  const where = documentVisibilityWhere(lawyer) as {
    AND?: Array<{ organizationId?: string; OR?: unknown[] }>;
  };
  assert.deepEqual(where.AND?.[0], { organizationId: org });
  // created + case-responsible + case-project-responsible + subject-visible
  assert.equal(where.AND?.[1]?.OR?.length, 4);
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

test("canViewRecord: LAWYER sees own task (direct) and responsible project's task", () => {
  assert.equal(canViewRecord(lawyer, "Task", { assignedToId: "u-lawyer" }), true);
  assert.equal(canViewRecord(lawyer, "Task", { assignedToId: "other" }), false);
  assert.equal(
    canViewRecord(lawyer, "Task", { project: { responsibleUserId: "u-lawyer" } }),
    true,
  );
});

test("canViewRecord: TRAINEE only sees directly-assigned tasks, not by responsibility", () => {
  assert.equal(canViewRecord(trainee, "Task", { assignedToId: "u-trainee" }), true);
  // responsibility on the project does NOT grant a trainee access:
  assert.equal(
    canViewRecord(trainee, "Task", { project: { responsibleUserId: "u-trainee" } }),
    false,
  );
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
