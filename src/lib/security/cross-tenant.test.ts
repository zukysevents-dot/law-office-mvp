import assert from "node:assert/strict";
import { test } from "node:test";

import { UserRole } from "@/generated/prisma/enums";

import {
  assertSameOrg,
  canEditRecord,
  canViewRecord,
  caseVisibilityWhere,
  deadlineVisibilityWhere,
  documentVisibilityWhere,
  invoiceVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";

// === ČÁST A / A1 — Tenant izolace (negativní testy) =========================
// Tyto testy jsou ZELENÉ jen tehdy, když je cross-tenant přístup ODEPŘEN:
// org-A uživatel nesmí nikdy dostat scope na org-B data, a org-less uživatel
// musí spadnout do denyWhere (fail-closed). Když denial zmizí, test padá → build
// červený. Běží bez DB (strukturální kontrola where-fragmentů). DB-backed verze
// (skutečné 0 řádků z cizí firmy) běží v gate A6/A1 jen s DATABASE_URL_TEST.

const ORG_A = "org-A";
const ORG_B = "org-B";

const adminA = { id: "u-admin-a", role: UserRole.ADMIN, organizationId: ORG_A };
const lawyerA = { id: "u-lawyer-a", role: UserRole.LAWYER, organizationId: ORG_A };
const traineeA = { id: "u-trainee-a", role: UserRole.TRAINEE, organizationId: ORG_A };
const internA = { id: "u-intern-a", role: UserRole.INTERN, organizationId: ORG_A };

// User resolved without an active org membership (should never see anything).
const orglessLawyer = { id: "u-orgless", role: UserRole.LAWYER };

// Recursively collect every organizationId value present in a where-fragment.
function collectOrgIds(node: unknown, acc: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectOrgIds(item, acc);
    }
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "organizationId" && typeof value === "string") {
        acc.push(value);
      } else {
        collectOrgIds(value, acc);
      }
    }
  }
  return acc;
}

// True when the fragment is the fail-closed denyWhere sentinel.
function isDeny(where: unknown): boolean {
  return Boolean(
    where &&
      typeof where === "object" &&
      (where as { id?: unknown }).id === "__role_denied__",
  );
}

const helpers: Array<{ name: string; fn: (u: typeof adminA) => unknown }> = [
  { name: "task", fn: taskVisibilityWhere },
  { name: "project", fn: projectVisibilityWhere },
  { name: "case", fn: caseVisibilityWhere },
  { name: "workLog", fn: workLogVisibilityWhere },
  { name: "subject", fn: subjectVisibilityWhere },
  { name: "invoice", fn: invoiceVisibilityWhere },
  { name: "deadline", fn: deadlineVisibilityWhere },
  { name: "document", fn: documentVisibilityWhere },
];

// --- 1) Org-A user's where buď scopuje na org A, nebo odepře — NIKDY org B ---
// Invariant cross-tenant izolace: pro libovolnou roli @ org A musí být výsledný
// where-fragment (a) bez jakékoli reference na cizí org B a zároveň (b) buď
// scopovaný na org A, NEBO fail-closed denyWhere. denyWhere (úplné odepření) je
// bezpečné chování — některé role na některé entity vůbec nevidí (např. INTERN
// na case/project), a to je správně.
for (const role of [adminA, lawyerA, traineeA, internA]) {
  for (const helper of helpers) {
    test(`A1: ${helper.name}VisibilityWhere(${role.role}@A) — jen org A nebo deny, nikdy org B`, () => {
      const where = helper.fn(role);
      const orgIds = collectOrgIds(where);
      assert.ok(
        !orgIds.includes(ORG_B),
        `fragment nesmí odkazovat na cizí org ${ORG_B}: ${JSON.stringify(where)}`,
      );
      assert.ok(
        orgIds.includes(ORG_A) || isDeny(where),
        `musí scopovat na org A nebo odepřít, fragment: ${JSON.stringify(where)}`,
      );
    });
  }
}

// --- 2) Org-less caller is denied everywhere (fail closed) ------------------
for (const helper of helpers) {
  test(`A1: ${helper.name}VisibilityWhere(org-less) → denyWhere (fail closed)`, () => {
    assert.ok(
      isDeny(helper.fn(orglessLawyer)),
      `org-less uživatel musí být odepřen, fragment: ${JSON.stringify(helper.fn(orglessLawyer))}`,
    );
  });
}

// --- 3) assertSameOrg blokuje cizí firmu i pro ADMIN ------------------------
test("A1: assertSameOrg(adminA, recordB) hodí výjimku (cizí firma)", () => {
  assert.throws(() => assertSameOrg(adminA, { organizationId: ORG_B }));
});

test("A1: assertSameOrg(adminA, recordA) NEhodí (vlastní firma)", () => {
  assert.doesNotThrow(() => assertSameOrg(adminA, { organizationId: ORG_A }));
});

// --- 4) canViewRecord/canEditRecord cross-tenant = false (i pro ADMIN) ------
test("A1: ADMIN org A nevidí ani needituje task z org B", () => {
  const taskB = {
    organizationId: ORG_B,
    createdById: adminA.id, // i kdyby ID „sedělo", org mismatch má přednost
    assignedToId: adminA.id,
    responsibleUserId: adminA.id,
  };
  assert.equal(canViewRecord(adminA, "Task", taskB), false);
  assert.equal(canEditRecord(adminA, "Task", taskB), false);
});

test("A1: LAWYER org A nevidí worklog z org B, i když je jeho userId", () => {
  const workLogB = { organizationId: ORG_B, userId: lawyerA.id };
  assert.equal(canViewRecord(lawyerA, "WorkLog", workLogB), false);
  assert.equal(canEditRecord(lawyerA, "WorkLog", workLogB), false);
});
