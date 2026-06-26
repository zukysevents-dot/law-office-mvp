import { cache } from "react";

import { ModuleKey, ModuleStatus } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";

// Entitlements are the ORTHOGONAL layer next to role-permissions: first "does the
// org have this module?", only then "may this user?". This file is the single
// authority for the former. It is FAIL-CLOSED: anything uncertain → not enabled.
//
// The pure helpers below take their inputs explicitly (no DB, no clock) so they
// are unit-testable; getEnabledModules() is the only DB-backed entry point.

// Just the fields the resolver needs from an OrganizationModule row.
export type OrgModuleState = {
  moduleKey: ModuleKey;
  status: ModuleStatus;
  trialEndsAt: Date | null;
};

// Caller shape accepted by assertModuleEnabled — matches getCurrentUser()'s
// return (which carries organizationId).
type EntitlementUser = { organizationId?: string | null } | null | undefined;

// Static module dependency graph. MUST mirror the seeded `Module.requiresKeys`
// catalog (prisma/seed.ts). Source of truth for the guard so it never needs a
// second DB read. A module is only effectively enabled when every dependency is.
export const MODULE_DEPENDENCIES: Record<ModuleKey, ModuleKey[]> = {
  [ModuleKey.CORE]: [],
  [ModuleKey.BILLING]: [],
  [ModuleKey.DATA_BOXES]: [],
  [ModuleKey.AML]: [],
  [ModuleKey.DEADLINES]: [],
  [ModuleKey.DOCUMENTS]: [],
  [ModuleKey.CLIENT_PORTAL]: [ModuleKey.DOCUMENTS],
  [ModuleKey.HR_ATTENDANCE]: [],
};

// Every non-core module, in catalog order — for admin/settings rendering.
export const SELLABLE_MODULE_KEYS: ModuleKey[] = [
  ModuleKey.BILLING,
  ModuleKey.DATA_BOXES,
  ModuleKey.AML,
  ModuleKey.DEADLINES,
  ModuleKey.DOCUMENTS,
  ModuleKey.CLIENT_PORTAL,
  ModuleKey.HR_ATTENDANCE,
];

function dependenciesOf(
  key: ModuleKey,
  dependencies: Record<string, ModuleKey[]>,
): ModuleKey[] {
  return dependencies[key] ?? [];
}

// Effective enabled set from raw rows. CORE is always present. A row counts only
// when ENABLED, or TRIAL with a FUTURE trialEndsAt. A TRIAL without an end date
// is treated as NOT enabled (fail-closed): an open-ended trial would otherwise
// never expire and silently grant a paid module. At the expiry instant
// (trialEndsAt === now) the trial is already over. Finally, any module whose
// dependencies are not (transitively) satisfied is dropped — so a dependency
// disabled after the fact can't leave a dependent silently active.
export function resolveEnabledModules(
  rows: OrgModuleState[],
  now: Date,
  dependencies: Record<string, ModuleKey[]> = MODULE_DEPENDENCIES,
): Set<ModuleKey> {
  const enabled = new Set<ModuleKey>([ModuleKey.CORE]);

  for (const row of rows) {
    if (row.status === ModuleStatus.ENABLED) {
      enabled.add(row.moduleKey);
    } else if (
      row.status === ModuleStatus.TRIAL &&
      row.trialEndsAt !== null &&
      row.trialEndsAt > now
    ) {
      enabled.add(row.moduleKey);
    }
  }

  // Repeat to a fixpoint so a chain A→B→C collapses fully if C is missing.
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...enabled]) {
      if (
        dependenciesOf(key, dependencies).some((dep) => !enabled.has(dep))
      ) {
        enabled.delete(key);
        changed = true;
      }
    }
  }

  return enabled;
}

// May `key` be enabled given what's currently enabled? Only if every dependency
// is already on. Used by the /admin toggle so entitlements stay consistent.
export function canEnableModule(
  key: ModuleKey,
  enabled: Set<ModuleKey>,
  dependencies: Record<string, ModuleKey[]> = MODULE_DEPENDENCIES,
): boolean {
  return dependenciesOf(key, dependencies).every((dep) => enabled.has(dep));
}

// Currently-enabled modules that depend on `key`; disabling `key` while any of
// these are on would orphan them, so the toggle must block it.
export function dependentsBlockingDisable(
  key: ModuleKey,
  enabled: Set<ModuleKey>,
  dependencies: Record<string, ModuleKey[]> = MODULE_DEPENDENCIES,
): ModuleKey[] {
  return [...enabled].filter(
    (other) =>
      other !== key && dependenciesOf(other, dependencies).includes(key),
  );
}

// --- DB-backed entry points --------------------------------------------------

// One DB read per org per request (React cache). Returns the effective set.
export const getEnabledModules = cache(
  async (organizationId: string): Promise<Set<ModuleKey>> => {
    const rows = await getPrisma().organizationModule.findMany({
      where: { organizationId },
      select: { moduleKey: true, status: true, trialEndsAt: true },
    });
    return resolveEnabledModules(rows, new Date());
  },
);

// CORE is always true. No org → fail closed (false). Otherwise consult the set.
export async function isModuleEnabled(
  organizationId: string | null | undefined,
  key: ModuleKey,
): Promise<boolean> {
  if (key === ModuleKey.CORE) {
    return true;
  }
  if (!organizationId) {
    return false;
  }
  return (await getEnabledModules(organizationId)).has(key);
}

// Authoritative server-side guard: call right after getCurrentUser() at the top
// of a module's pages, server actions and route handlers. Throws (fail-closed)
// when the module is off. This guard is wired into each module as it ships
// (BILLING in F1/B-2, DEADLINES in F4/L-2, …); the menu hiding in AppShell is
// UX only and is NOT a security boundary.
export async function assertModuleEnabled(
  user: EntitlementUser,
  key: ModuleKey,
): Promise<void> {
  if (!(await isModuleEnabled(user?.organizationId ?? null, key))) {
    throw new Error("Tento modul není pro vaši kancelář aktivní.");
  }
}
