import type { UserRole } from "@/generated/prisma/enums";
import {
  getPermissionDef,
  permissionRoleLabels,
  permissionScopeLabels,
  type PermissionScope,
} from "@/lib/permission-catalog";
import { permissionOverrideLabels } from "@/lib/labels";

// Čitelný český detail auditního záznamu změny matice oprávnění („kdo, co,
// staré → nové“) místo surového JSON s technickými klíči. Čistá funkce — volá
// ji stránka Audit log i CSV export. Pro jiné entity vrací null.

type AuditChanges = Record<string, unknown>;

function changesOf(value: unknown): AuditChanges {
  if (value && typeof value === "object" && "changes" in value) {
    const changes = (value as { changes?: unknown }).changes;
    if (changes && typeof changes === "object") {
      return changes as AuditChanges;
    }
  }
  return {};
}

function roleOf(value: unknown): UserRole | null {
  if (value && typeof value === "object" && "role" in value) {
    const role = (value as { role?: unknown }).role;
    if (typeof role === "string" && role in permissionRoleLabels) {
      return role as UserRole;
    }
  }
  return null;
}

function permissionLabel(key: string): string {
  const def = getPermissionDef(key);
  if (!def) {
    return key;
  }
  return def.kind === "scope" ? `${def.label} (rozsah dat)` : def.label;
}

// Role: true/false (úprava) nebo uložená hodnota ALLOW/DENY (obnovení);
// uživatel: INHERIT/ALLOW/DENY; rozsah dat: ALL/ASSIGNED/OWN.
function valueLabel(value: unknown, kind: "role" | "user"): string {
  if (value === true) return "Ano";
  if (value === false) return "Ne";
  if (typeof value === "string") {
    if (value in permissionScopeLabels) {
      return permissionScopeLabels[value as PermissionScope];
    }
    if (kind === "user" && value in permissionOverrideLabels) {
      return permissionOverrideLabels[value as keyof typeof permissionOverrideLabels];
    }
    if (value === "ALLOW") return "Ano";
    if (value === "DENY") return "Ne";
    if (value === "INHERIT") return permissionOverrideLabels.INHERIT;
    return value;
  }
  return "—";
}

export function formatPermissionAudit(log: {
  entityType: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
}): string | null {
  if (log.entityType !== "RolePermission" && log.entityType !== "UserPermission") {
    return null;
  }
  const kind = log.entityType === "RolePermission" ? "role" : "user";
  const before = changesOf(log.oldValue);
  const after = changesOf(log.newValue);
  const isReset = log.action === "RESET";
  const resetTarget = kind === "role" ? "výchozí" : permissionOverrideLabels.INHERIT;

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const parts = keys.map((key) => {
    const from = key in before ? valueLabel(before[key], kind) : "—";
    const to =
      key in after ? valueLabel(after[key], kind) : isReset ? resetTarget : "—";
    return `${permissionLabel(key)}: ${from} → ${to}`;
  });

  const role = roleOf(log.newValue) ?? roleOf(log.oldValue);
  const prefix =
    kind === "role" && role
      ? `Role ${permissionRoleLabels[role]}${isReset ? " – obnoveno na výchozí" : ""}`
      : isReset
        ? "Výjimky zrušeny"
        : "";
  if (parts.length === 0) {
    return prefix ? `${prefix}: beze změny` : "Beze změny";
  }
  return prefix ? `${prefix}: ${parts.join("; ")}` : parts.join("; ");
}
