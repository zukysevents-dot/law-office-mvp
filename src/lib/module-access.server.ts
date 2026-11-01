import "server-only";

import { getEnabledModules, isModuleEnabled } from "@/lib/entitlements";
import {
  getModulePermissionDef,
  MODULE_PERMISSION_KEYS,
  type ModulePermissionKey,
} from "@/lib/permission-catalog";
import { hasPermission } from "@/lib/permissions";

type ModuleUser = Parameters<typeof hasPermission>[0] & {
  organizationId?: string | null;
};

function orgIdOf(user: ModuleUser): string | null {
  return typeof user === "object" && user ? user.organizationId ?? null : null;
}

// A module (menu section) is accessible when BOTH layers allow it:
//   1. the user's permission matrix grants module.X, and
//   2. the office has the module (entitlement — paid modules).
// This is the authoritative server-side guard; hiding menu items is UX only.
export async function canAccessModule(
  user: ModuleUser,
  key: ModulePermissionKey,
): Promise<boolean> {
  if (!hasPermission(user, key)) {
    return false;
  }
  return isModuleEnabled(orgIdOf(user), getModulePermissionDef(key).entitlement);
}

// Throwing variant for server actions and route handlers. The entitlement
// message comes first so an inactive office module is not reported as a
// missing personal permission.
export async function assertCanAccessModule(
  user: ModuleUser,
  key: ModulePermissionKey,
): Promise<void> {
  const def = getModulePermissionDef(key);
  if (!(await isModuleEnabled(orgIdOf(user), def.entitlement))) {
    throw new Error("Tento modul není pro vaši kancelář aktivní.");
  }
  if (!hasPermission(user, key)) {
    throw new Error(`Nemáte přístup k modulu ${def.label}.`);
  }
}

// Every module key the user may open right now (permission ∧ entitlement).
// One entitlement read per request (getEnabledModules is cached).
export async function getAccessibleModules(
  user: ModuleUser,
): Promise<ModulePermissionKey[]> {
  const orgId = orgIdOf(user);
  const enabled = orgId ? await getEnabledModules(orgId) : null;
  return MODULE_PERMISSION_KEYS.filter((key) => {
    if (!hasPermission(user, key)) {
      return false;
    }
    const entitlement = getModulePermissionDef(key).entitlement;
    return entitlement === "CORE" || Boolean(enabled?.has(entitlement));
  });
}

// Message for the "Přístup odepřen" page when the module can't be opened, or
// null when it can. Distinguishes an inactive office module from a missing
// personal permission so the user knows whom to ask.
export async function moduleAccessDenial(
  user: ModuleUser,
  key: ModulePermissionKey,
): Promise<string | null> {
  const def = getModulePermissionDef(key);
  if (!(await isModuleEnabled(orgIdOf(user), def.entitlement))) {
    return `Modul „${def.label}“ není pro vaši kancelář aktivní. Aktivaci zajistí administrátor kanceláře.`;
  }
  if (!hasPermission(user, key)) {
    return `K modulu „${def.label}“ nemáte oprávnění. O přístup požádejte administrátora kanceláře (Nastavení → Oprávnění).`;
  }
  return null;
}
