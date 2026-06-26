import assert from "node:assert/strict";
import { test } from "node:test";

import { ModuleKey, ModuleStatus } from "@/generated/prisma/enums";

import {
  assertModuleEnabled,
  canEnableModule,
  dependentsBlockingDisable,
  isModuleEnabled,
  MODULE_DEPENDENCIES,
  resolveEnabledModules,
  type OrgModuleState,
} from "./entitlements";

const NOW = new Date("2026-06-25T12:00:00.000Z");
const FUTURE = new Date("2026-07-25T12:00:00.000Z");
const PAST = new Date("2026-05-25T12:00:00.000Z");

function row(
  moduleKey: ModuleKey,
  status: ModuleStatus,
  trialEndsAt: Date | null = null,
): OrgModuleState {
  return { moduleKey, status, trialEndsAt };
}

// --- resolveEnabledModules ---------------------------------------------------

test("resolveEnabledModules: CORE is always enabled, even with no rows", () => {
  const enabled = resolveEnabledModules([], NOW);
  assert.equal(enabled.has(ModuleKey.CORE), true);
  assert.equal(enabled.size, 1);
});

test("resolveEnabledModules: ENABLED rows count, DISABLED do not", () => {
  const enabled = resolveEnabledModules(
    [
      row(ModuleKey.BILLING, ModuleStatus.ENABLED),
      row(ModuleKey.AML, ModuleStatus.DISABLED),
    ],
    NOW,
  );
  assert.equal(enabled.has(ModuleKey.BILLING), true);
  assert.equal(enabled.has(ModuleKey.AML), false);
});

test("resolveEnabledModules: TRIAL counts only with a future end date (fail-closed)", () => {
  const live = resolveEnabledModules(
    [row(ModuleKey.DEADLINES, ModuleStatus.TRIAL, FUTURE)],
    NOW,
  );
  assert.equal(live.has(ModuleKey.DEADLINES), true);

  const expired = resolveEnabledModules(
    [row(ModuleKey.DEADLINES, ModuleStatus.TRIAL, PAST)],
    NOW,
  );
  assert.equal(expired.has(ModuleKey.DEADLINES), false);

  // At the exact expiry instant the trial is already over (strict >).
  const atExpiry = resolveEnabledModules(
    [row(ModuleKey.DEADLINES, ModuleStatus.TRIAL, NOW)],
    NOW,
  );
  assert.equal(atExpiry.has(ModuleKey.DEADLINES), false);

  // Open-ended trial (no end date) is NOT enabled — fail-closed, so an
  // end-date-less trial can never grant a paid module indefinitely.
  const openEnded = resolveEnabledModules(
    [row(ModuleKey.DEADLINES, ModuleStatus.TRIAL, null)],
    NOW,
  );
  assert.equal(openEnded.has(ModuleKey.DEADLINES), false);
});

test("resolveEnabledModules: dependent dropped when its dependency is off", () => {
  // CLIENT_PORTAL requires DOCUMENTS. Enabling only the portal must not stick.
  const enabled = resolveEnabledModules(
    [row(ModuleKey.CLIENT_PORTAL, ModuleStatus.ENABLED)],
    NOW,
  );
  assert.equal(enabled.has(ModuleKey.CLIENT_PORTAL), false);
  assert.equal(enabled.has(ModuleKey.DOCUMENTS), false);
});

test("resolveEnabledModules: dependent kept when its dependency is on", () => {
  const enabled = resolveEnabledModules(
    [
      row(ModuleKey.DOCUMENTS, ModuleStatus.ENABLED),
      row(ModuleKey.CLIENT_PORTAL, ModuleStatus.ENABLED),
    ],
    NOW,
  );
  assert.equal(enabled.has(ModuleKey.DOCUMENTS), true);
  assert.equal(enabled.has(ModuleKey.CLIENT_PORTAL), true);
});

test("resolveEnabledModules: transitive collapse via custom dependency graph", () => {
  // A→B→C chain: with C missing, both A and B must drop.
  const deps: Record<string, ModuleKey[]> = {
    [ModuleKey.CORE]: [],
    [ModuleKey.BILLING]: [ModuleKey.AML], // A needs B
    [ModuleKey.AML]: [ModuleKey.DEADLINES], // B needs C
    [ModuleKey.DEADLINES]: [], // C — left off
    [ModuleKey.DATA_BOXES]: [],
    [ModuleKey.DOCUMENTS]: [],
    [ModuleKey.CLIENT_PORTAL]: [],
    [ModuleKey.HR_ATTENDANCE]: [],
  };
  const enabled = resolveEnabledModules(
    [
      row(ModuleKey.BILLING, ModuleStatus.ENABLED),
      row(ModuleKey.AML, ModuleStatus.ENABLED),
    ],
    NOW,
    deps,
  );
  assert.equal(enabled.has(ModuleKey.BILLING), false);
  assert.equal(enabled.has(ModuleKey.AML), false);
  assert.equal(enabled.has(ModuleKey.CORE), true);
});

// --- MODULE_DEPENDENCIES integrity -------------------------------------------

test("MODULE_DEPENDENCIES has an entry for every ModuleKey (no silent empty fallback)", () => {
  // dependenciesOf() falls back to [] for a missing key, which would silently
  // treat a new module as dependency-free. Guard against that drift.
  for (const key of Object.values(ModuleKey)) {
    assert.ok(
      key in MODULE_DEPENDENCIES,
      `MODULE_DEPENDENCIES is missing an entry for ${key}`,
    );
  }
});

// --- canEnableModule ---------------------------------------------------------

test("canEnableModule: blocked until dependency present, then allowed", () => {
  assert.equal(
    canEnableModule(ModuleKey.CLIENT_PORTAL, new Set([ModuleKey.CORE])),
    false,
  );
  assert.equal(
    canEnableModule(
      ModuleKey.CLIENT_PORTAL,
      new Set([ModuleKey.CORE, ModuleKey.DOCUMENTS]),
    ),
    true,
  );
  // No-dependency module is always enable-able.
  assert.equal(
    canEnableModule(ModuleKey.BILLING, new Set([ModuleKey.CORE])),
    true,
  );
});

// --- dependentsBlockingDisable ----------------------------------------------

test("dependentsBlockingDisable: lists enabled dependents that block disabling", () => {
  const enabled = new Set([
    ModuleKey.CORE,
    ModuleKey.DOCUMENTS,
    ModuleKey.CLIENT_PORTAL,
  ]);
  assert.deepEqual(dependentsBlockingDisable(ModuleKey.DOCUMENTS, enabled), [
    ModuleKey.CLIENT_PORTAL,
  ]);
  // Nothing depends on the portal, so it is free to disable.
  assert.deepEqual(
    dependentsBlockingDisable(ModuleKey.CLIENT_PORTAL, enabled),
    [],
  );
});

// --- isModuleEnabled: DB-free fail-closed paths ------------------------------

test("isModuleEnabled: CORE is always true regardless of org", async () => {
  assert.equal(await isModuleEnabled(null, ModuleKey.CORE), true);
  assert.equal(await isModuleEnabled(undefined, ModuleKey.CORE), true);
  assert.equal(await isModuleEnabled("org-1", ModuleKey.CORE), true);
});

test("isModuleEnabled: no organization → fail closed (false) without a DB read", async () => {
  assert.equal(await isModuleEnabled(null, ModuleKey.BILLING), false);
  assert.equal(await isModuleEnabled(undefined, ModuleKey.BILLING), false);
  assert.equal(await isModuleEnabled("", ModuleKey.BILLING), false);
});

// --- assertModuleEnabled: DB-free fail-closed guard --------------------------
// Exact message the guard must throw. Kept as a constant so the diacritics in the
// regex/predicate below stay in sync with the production string.
const MODULE_OFF_MESSAGE = "Tento modul není pro vaši kancelář aktivní.";

test("assertModuleEnabled: CORE never throws, regardless of org", async () => {
  // CORE resolves true without any DB read, so the guard must resolve quietly.
  await assert.doesNotReject(assertModuleEnabled(null, ModuleKey.CORE));
  await assert.doesNotReject(assertModuleEnabled(undefined, ModuleKey.CORE));
  await assert.doesNotReject(
    assertModuleEnabled({ organizationId: "org-1" }, ModuleKey.CORE),
  );
});

test("assertModuleEnabled: non-CORE with no org → throws the exact Czech message", async () => {
  // null user: fail closed with the verbatim message (diacritics included).
  await assert.rejects(
    assertModuleEnabled(null, ModuleKey.BILLING),
    (err: unknown) =>
      err instanceof Error && err.message === MODULE_OFF_MESSAGE,
  );
});

test("assertModuleEnabled: user with organizationId=null → throws (fail-closed)", async () => {
  // A user object whose org is explicitly null must still be rejected without a DB read.
  await assert.rejects(
    assertModuleEnabled({ organizationId: null }, ModuleKey.BILLING),
    (err: unknown) =>
      err instanceof Error && err.message === MODULE_OFF_MESSAGE,
  );
});

test("assertModuleEnabled: undefined user → throws (fail-closed)", async () => {
  // No user at all (e.g. unauthenticated) is the strictest fail-closed case.
  await assert.rejects(
    assertModuleEnabled(undefined, ModuleKey.BILLING),
    (err: unknown) =>
      err instanceof Error && err.message === MODULE_OFF_MESSAGE,
  );
});
