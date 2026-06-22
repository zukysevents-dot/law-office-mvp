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

const admin = { id: "u-admin", role: UserRole.ADMIN };
const partner = { id: "u-partner", role: UserRole.PARTNER };
const lawyer = { id: "u-lawyer", role: UserRole.LAWYER };
const trainee = { id: "u-trainee", role: UserRole.TRAINEE };
const intern = { id: "u-intern", role: UserRole.INTERN };

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
test("taskVisibilityWhere: ADMIN/PARTNER unrestricted ({})", () => {
  assert.deepEqual(taskVisibilityWhere(admin), {});
  assert.deepEqual(taskVisibilityWhere(partner), {});
});

test("taskVisibilityWhere: missing user → fail-closed deny clause", () => {
  assert.deepEqual(taskVisibilityWhere(null), { id: "__role_denied__" });
});

test("taskVisibilityWhere: TRAINEE/INTERN scoped to direct assignment only", () => {
  const expected = {
    OR: [
      { createdById: "u-trainee" },
      { assignedToId: "u-trainee" },
      { responsibleUserId: "u-trainee" },
    ],
  };
  assert.deepEqual(taskVisibilityWhere(trainee), expected);
  assert.deepEqual(taskVisibilityWhere(intern), {
    OR: [
      { createdById: "u-intern" },
      { assignedToId: "u-intern" },
      { responsibleUserId: "u-intern" },
    ],
  });
});

test("taskVisibilityWhere: LAWYER gets a broader OR (direct + responsibility)", () => {
  const where = taskVisibilityWhere(lawyer) as { OR?: unknown[] };
  assert.ok(Array.isArray(where.OR));
  assert.equal(where.OR?.length, 4);
});

test("workLogVisibilityWhere: TRAINEE/INTERN see only their own logs", () => {
  assert.deepEqual(workLogVisibilityWhere(trainee), { userId: "u-trainee" });
  assert.deepEqual(workLogVisibilityWhere(intern), { userId: "u-intern" });
  assert.deepEqual(workLogVisibilityWhere(admin), {});
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
