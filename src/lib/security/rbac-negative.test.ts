import assert from "node:assert/strict";
import { test } from "node:test";

import { UserRole } from "@/generated/prisma/enums";

import {
  assertCanArchiveRecords,
  assertCanEditRecord,
  assertCanManageAml,
  assertCanManageHr,
  assertCanManageInvoices,
  assertCanManageUsers,
  canEditRecord,
  canViewRecord,
} from "@/lib/permissions";

// === ČÁST A / A2 — Autorizace UVNITŘ tenanta (RBAC negativní testy) =========
// Běžný uživatel firmy zkouší admin akce / cizí objekty VE SVÉ firmě → musí být
// odepřeno. ZELENÁ = přístup odepřen (assert.throws / === false). Pokud se
// oprávnění uvolní, testy padají → build červený. Vše v rámci jedné org, aby šlo
// čistě o roli, ne o tenant izolaci (tu řeší cross-tenant.test.ts).

const ORG = "org-1";
const admin = { id: "u-admin", role: UserRole.ADMIN, organizationId: ORG };
const partner = { id: "u-partner", role: UserRole.PARTNER, organizationId: ORG };
const lawyer = { id: "u-lawyer", role: UserRole.LAWYER, organizationId: ORG };
const trainee = { id: "u-trainee", role: UserRole.TRAINEE, organizationId: ORG };
const intern = { id: "u-intern", role: UserRole.INTERN, organizationId: ORG };

const juniors = [
  { label: "LAWYER", user: lawyer },
  { label: "TRAINEE", user: trainee },
  { label: "INTERN", user: intern },
];

// --- 1) Archivace: jen ADMIN/PARTNER ----------------------------------------
for (const { label, user } of juniors) {
  test(`A2: ${label} NESMÍ archivovat (assertCanArchiveRecords throws)`, () => {
    assert.throws(() => assertCanArchiveRecords(user));
  });
}
test("A2: ADMIN/PARTNER archivovat smí", () => {
  assert.doesNotThrow(() => assertCanArchiveRecords(admin));
  assert.doesNotThrow(() => assertCanArchiveRecords(partner));
});

// --- 2) Správa uživatelů: jen ADMIN/PARTNER ---------------------------------
for (const { label, user } of juniors) {
  test(`A2: ${label} NESMÍ spravovat uživatele`, () => {
    assert.throws(() => assertCanManageUsers(user));
  });
}

// --- 3) AML/KYC (citlivé): jen ADMIN/PARTNER --------------------------------
for (const { label, user } of juniors) {
  test(`A2: ${label} NESMÍ k AML/KYC`, () => {
    assert.throws(() => assertCanManageAml(user));
  });
}

// --- 4) HR/mzdy: jen ADMIN/PARTNER ------------------------------------------
for (const { label, user } of juniors) {
  test(`A2: ${label} NESMÍ spravovat HR`, () => {
    assert.throws(() => assertCanManageHr(user));
  });
}

// --- 5) Faktury: TRAINEE/INTERN ne; LAWYER ano ------------------------------
test("A2: TRAINEE/INTERN NESMÍ spravovat faktury", () => {
  assert.throws(() => assertCanManageInvoices(trainee));
  assert.throws(() => assertCanManageInvoices(intern));
});
test("A2: LAWYER faktury spravovat smí", () => {
  assert.doesNotThrow(() => assertCanManageInvoices(lawyer));
});

// --- 6) Cizí objekt VE SVÉ firmě: junior ho nesmí editovat ------------------
// Task ve stejné org, ale přiřazený někomu jinému — TRAINEE na něj nemá právo.
const foreignTaskSameOrg = {
  organizationId: ORG,
  createdById: "u-someone-else",
  assignedToId: "u-someone-else",
  responsibleUserId: "u-someone-else",
};

test("A2: TRAINEE nevidí ani needituje cizí task ve své firmě", () => {
  assert.equal(canViewRecord(trainee, "Task", foreignTaskSameOrg), false);
  assert.equal(canEditRecord(trainee, "Task", foreignTaskSameOrg), false);
  assert.throws(() => assertCanEditRecord(trainee, "Task", foreignTaskSameOrg));
});

test("A2: TRAINEE vidí a edituje VLASTNÍ task (kontrolní pozitivní případ)", () => {
  const ownTask = {
    organizationId: ORG,
    createdById: trainee.id,
    assignedToId: trainee.id,
    responsibleUserId: trainee.id,
  };
  assert.equal(canEditRecord(trainee, "Task", ownTask), true);
});

// --- 7) Cizí projekt ve své firmě: LAWYER bez zodpovědnosti ho needituje -----
test("A2: LAWYER needituje projekt, za který nezodpovídá", () => {
  const foreignProject = { organizationId: ORG, responsibleUserId: "u-someone-else" };
  assert.equal(canEditRecord(lawyer, "Project", foreignProject), false);
  assert.throws(() => assertCanEditRecord(lawyer, "Project", foreignProject));
});
