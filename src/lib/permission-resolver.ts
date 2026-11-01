import { Capability, UserRole } from "@/generated/prisma/enums";
import {
  PERMISSION_ALLOW,
  PERMISSION_CATALOG,
  PERMISSION_DENY,
  getPermissionDef,
  isValidPermissionValue,
  type PermissionDef,
  type PermissionKey,
  type PermissionScope,
} from "@/lib/permission-catalog";

// Čistý resolver efektivních oprávnění (bez DB, bez hodin) — unit-testovatelný.
// Pořadí vyhodnocení (pozdější vyhrává):
//   výchozí hodnota role (katalog)
//   → výjimka role v kanceláři (rolePermissionOverrides)
//   → starší per-user grant (userCapabilityGrants: VIEW_RATES, MANAGE_INVOICES)
//     = ALLOW, pokud pro klíč neexistuje výjimka uživatele
//   → výjimka uživatele (userPermissionOverrides)
// ADMIN má vždy vše a výjimky se na něj neuplatní. Neznámá role → nic (fail-closed).

export type PermissionValue = boolean | PermissionScope;
export type EffectivePermissions = Readonly<Record<PermissionKey, PermissionValue>>;
export type OverrideRow = { permission: string; value: string };

const LEGACY_CAPABILITY_KEYS: Record<Capability, PermissionKey> = {
  [Capability.VIEW_RATES]: "function.viewRates",
  [Capability.MANAGE_INVOICES]: "function.manageInvoices",
};

export function legacyCapabilityForPermission(
  key: string,
): Capability | null {
  for (const [capability, permission] of Object.entries(
    LEGACY_CAPABILITY_KEYS,
  )) {
    if (permission === key) {
      return capability as Capability;
    }
  }
  return null;
}

function isKnownRole(role: unknown): role is UserRole {
  return (
    typeof role === "string" &&
    (Object.values(UserRole) as string[]).includes(role)
  );
}

function narrowestScope(def: PermissionDef & { kind: "scope" }) {
  return def.options[def.options.length - 1];
}

// Stored string → typed value for `def`, or undefined when invalid.
export function parsePermissionValue(
  def: PermissionDef,
  value: string,
): PermissionValue | undefined {
  if (!isValidPermissionValue(def.key, value)) {
    return undefined;
  }
  if (def.kind === "scope") {
    return value as PermissionScope;
  }
  return value === PERMISSION_ALLOW;
}

// Typed value → stored string.
export function serializePermissionValue(value: PermissionValue): string {
  if (typeof value === "boolean") {
    return value ? PERMISSION_ALLOW : PERMISSION_DENY;
  }
  return value;
}

function emptyPermissions(): Record<PermissionKey, PermissionValue> {
  const result = {} as Record<PermissionKey, PermissionValue>;
  for (const def of PERMISSION_CATALOG) {
    result[def.key] = def.kind === "scope" ? narrowestScope(def) : false;
  }
  return result;
}

function adminPermissions(): Record<PermissionKey, PermissionValue> {
  const result = {} as Record<PermissionKey, PermissionValue>;
  for (const def of PERMISSION_CATALOG) {
    result[def.key] = def.kind === "scope" ? "ALL" : true;
  }
  return result;
}

export function defaultPermissionsForRole(
  role: UserRole | null | undefined,
): EffectivePermissions {
  if (!isKnownRole(role)) {
    return Object.freeze(emptyPermissions());
  }
  if (role === UserRole.ADMIN) {
    return Object.freeze(adminPermissions());
  }
  const result = {} as Record<PermissionKey, PermissionValue>;
  for (const def of PERMISSION_CATALOG) {
    result[def.key] = def.defaults[role];
  }
  return Object.freeze(result);
}

function applyOverrides(
  target: Record<PermissionKey, PermissionValue>,
  rows: OverrideRow[],
) {
  for (const row of rows) {
    const def = getPermissionDef(row.permission);
    if (!def) {
      continue;
    }
    const value = parsePermissionValue(def, row.value);
    if (value !== undefined) {
      target[def.key] = value;
    }
  }
}

export function resolvePermissions(input: {
  role: UserRole | null | undefined;
  roleOverrides?: OverrideRow[];
  userOverrides?: OverrideRow[];
  legacyCapabilities?: Capability[];
}): EffectivePermissions {
  const { role } = input;
  if (!isKnownRole(role)) {
    return Object.freeze(emptyPermissions());
  }
  if (role === UserRole.ADMIN) {
    return Object.freeze(adminPermissions());
  }

  const result = { ...defaultPermissionsForRole(role) } as Record<
    PermissionKey,
    PermissionValue
  >;
  applyOverrides(result, input.roleOverrides ?? []);

  const userOverrides = input.userOverrides ?? [];
  const userOverrideKeys = new Set(
    userOverrides
      .filter((row) => isValidPermissionValue(row.permission, row.value))
      .map((row) => row.permission),
  );
  for (const capability of input.legacyCapabilities ?? []) {
    const key = LEGACY_CAPABILITY_KEYS[capability];
    if (key && !userOverrideKeys.has(key)) {
      result[key] = true;
    }
  }

  applyOverrides(result, userOverrides);
  return Object.freeze(result);
}

// Value of one permission for a role after its role-level overrides (no user
// overrides) — what "Podle role" means on the user-overrides page.
export function rolePermissionValue(
  role: UserRole,
  key: PermissionKey,
  roleOverrides: OverrideRow[],
): PermissionValue {
  return resolvePermissions({ role, roleOverrides })[key];
}
