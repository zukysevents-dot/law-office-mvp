import assert from "node:assert/strict";
import { test } from "node:test";

import { UserRole } from "@/generated/prisma/enums";

import {
  andWhere,
  canEditRecord,
  canViewAllLegalData,
  canViewRecord,
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
