import assert from "node:assert/strict";
import { test } from "node:test";

import { UserRole } from "@/generated/prisma/enums";

import { resolvePermissions } from "./permission-resolver";
import {
  assertCanEditHrPresencePlan,
  assertCanManageHrNews,
  canEditHrPresencePlan,
  canManageHrNews,
  hrNewsTargetWhere,
  hrNewsVisibilityWhere,
  hrPresencePlanVisibilityWhere,
  hrTeamAbsenceCalendarWhere,
  hrTeamDirectoryWhere,
} from "./permissions";

const org = "org-1";
const admin = { id: "u-admin", role: UserRole.ADMIN, organizationId: org };
const partner = { id: "u-partner", role: UserRole.PARTNER, organizationId: org };
const lawyer = { id: "u-lawyer", role: UserRole.LAWYER, organizationId: org };
const trainee = { id: "u-trainee", role: UserRole.TRAINEE, organizationId: org };
const deny = { id: "__role_denied__" };

const targetOf = (userId: string, role: UserRole) => ({
  OR: [
    { audience: "ALL" },
    { audience: "ROLES", audienceRoles: { has: role } },
    { audience: "USERS", recipients: { some: { userId } } },
  ],
});

// --- Kdo smí přidávat aktuality -----------------------------------------------

test("canManageHrNews: výchozí ADMIN a PARTNER, ostatní ne", () => {
  assert.equal(canManageHrNews(admin), true);
  assert.equal(canManageHrNews(partner), true);
  assert.equal(canManageHrNews(lawyer), false);
  assert.equal(canManageHrNews(trainee), false);
  assert.equal(canManageHrNews(null), false);
  assert.throws(() => assertCanManageHrNews(lawyer), /aktuality/);
});

test("canManageHrNews: rozšiřitelné výjimkou uživatele v matici oprávnění", () => {
  const permissions = resolvePermissions({
    role: UserRole.TRAINEE,
    userOverrides: [{ permission: "function.manageNews", value: "ALLOW" }],
  });
  assert.equal(canManageHrNews({ ...trainee, permissions }), true);

  const revoked = resolvePermissions({
    role: UserRole.PARTNER,
    roleOverrides: [{ permission: "function.manageNews", value: "DENY" }],
  });
  assert.equal(canManageHrNews({ ...partner, permissions: revoked }), false);
});

// --- Viditelnost aktualit (query layer) ---------------------------------------

test("hrNewsTargetWhere: celá kancelář, role uživatele nebo vybraný příjemce", () => {
  assert.deepEqual(hrNewsTargetWhere(trainee), {
    AND: [{ organizationId: org }, targetOf("u-trainee", UserRole.TRAINEE)],
  });
  // I správce aktualit dostane na dashboardu jen ty určené jemu.
  assert.deepEqual(hrNewsTargetWhere(partner), {
    AND: [{ organizationId: org }, targetOf("u-partner", UserRole.PARTNER)],
  });
});

test("hrNewsTargetWhere: bez org / id / role → deny", () => {
  assert.deepEqual(hrNewsTargetWhere({ id: "u", role: UserRole.LAWYER }), deny);
  assert.deepEqual(hrNewsTargetWhere(null), deny);
  assert.deepEqual(hrNewsTargetWhere(UserRole.ADMIN), deny);
  assert.deepEqual(
    hrNewsTargetWhere({ id: "", role: UserRole.LAWYER, organizationId: org }),
    deny,
  );
});

test("hrNewsVisibilityWhere: správce celá kancelář, ostatní určené + vlastní", () => {
  assert.deepEqual(hrNewsVisibilityWhere(admin), { organizationId: org });
  assert.deepEqual(hrNewsVisibilityWhere(partner), { organizationId: org });
  assert.deepEqual(hrNewsVisibilityWhere(lawyer), {
    AND: [
      { organizationId: org },
      {
        OR: [
          { AND: [{ organizationId: org }, targetOf("u-lawyer", UserRole.LAWYER)] },
          { createdById: "u-lawyer" },
        ],
      },
    ],
  });
  assert.deepEqual(hrNewsVisibilityWhere({ id: "x", role: UserRole.ADMIN }), deny);
});

// --- Plán přítomnosti ---------------------------------------------------------

test("hrPresencePlanVisibilityWhere: týmový přehled v rámci kanceláře, jinak deny", () => {
  assert.deepEqual(hrPresencePlanVisibilityWhere(trainee), { organizationId: org });
  assert.deepEqual(hrPresencePlanVisibilityWhere({ id: "x", role: UserRole.ADMIN }), deny);
  assert.deepEqual(hrPresencePlanVisibilityWhere(null), deny);
});

test("canEditHrPresencePlan: vlastní plán každý, cizí jen správce HR", () => {
  assert.equal(canEditHrPresencePlan(trainee, { userId: "u-trainee" }), true);
  assert.equal(canEditHrPresencePlan(trainee, { userId: "u-lawyer" }), false);
  assert.equal(canEditHrPresencePlan(trainee, { userId: null }), false);
  assert.equal(canEditHrPresencePlan(partner, { userId: "u-lawyer" }), true);
  assert.equal(canEditHrPresencePlan(partner, null), false);
  assert.throws(() => assertCanEditHrPresencePlan(lawyer, { userId: "u-trainee" }));
});

test("hrTeamDirectoryWhere: aktivní karty kanceláře", () => {
  assert.deepEqual(hrTeamDirectoryWhere(trainee), {
    AND: [{ organizationId: org }, { archivedAt: null, active: true }],
  });
  assert.deepEqual(hrTeamDirectoryWhere(null), deny);
});

test("hrTeamAbsenceCalendarWhere: kolegové jen schválené, čekající jen vlastní", () => {
  assert.deepEqual(hrTeamAbsenceCalendarWhere(admin), {
    AND: [{ organizationId: org }, { status: { in: ["APPROVED", "PENDING"] } }],
  });
  assert.deepEqual(hrTeamAbsenceCalendarWhere(trainee), {
    AND: [
      { organizationId: org },
      {
        OR: [
          { status: "APPROVED" },
          { status: "PENDING", employee: { is: { userId: "u-trainee" } } },
        ],
      },
    ],
  });
  assert.deepEqual(hrTeamAbsenceCalendarWhere({ id: "x", role: UserRole.LAWYER }), deny);
});
