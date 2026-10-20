"use server";

import { revalidatePath } from "next/cache";

import {
  OrganizationMemberStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { auditCreateData } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  EDITABLE_ROLES,
  editablePermissionDefs,
  getPermissionDef,
  permissionRoleLabels,
  type PermissionDef,
  type PermissionKey,
} from "@/lib/permission-catalog";
import {
  legacyCapabilityForPermission,
  parsePermissionValue,
  resolvePermissions,
  serializePermissionValue,
  type OverrideRow,
  type PermissionValue,
} from "@/lib/permission-resolver";
import {
  loadLegacyCapabilities,
  loadRoleOverrides,
  loadUserOverrides,
} from "@/lib/permission-store.server";
import { assertCanManagePermissions, isAdmin } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export type PermissionFormState = {
  ok: boolean;
  message?: string;
  error?: string;
  // Changes on every submit — the form re-mounts from fresh server props.
  version: number;
};

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

const INHERIT = "INHERIT";

// Audit row written inside the same transaction as the change it records.
function auditEntry(input: Parameters<typeof auditCreateData>[0]) {
  return { data: auditCreateData(input) };
}

function done(message: string): PermissionFormState {
  return { ok: true, message, version: Date.now() };
}

function failed(error: string): PermissionFormState {
  return { ok: false, error, version: Date.now() };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Uložení se nezdařilo.";
}

function revalidateEverything() {
  // Permissions change menus, lists and guards on every page.
  revalidatePath("/", "layout");
}

function isEditableRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (EDITABLE_ROLES as readonly string[]).includes(value)
  );
}

// Keys the submitted form actually rendered (hidden `keys` inputs), limited to
// editable catalog permissions. Anything not rendered is left untouched.
function submittedDefs(formData: FormData): PermissionDef[] {
  const editable = new Map(
    editablePermissionDefs().map((def) => [def.key as string, def]),
  );
  const keys = new Set(
    formData
      .getAll("keys")
      .filter((value): value is string => typeof value === "string"),
  );
  return [...keys]
    .map((key) => editable.get(key))
    .filter((def): def is PermissionDef => Boolean(def));
}

function valuesEqual(a: PermissionValue, b: PermissionValue) {
  return a === b;
}

// The acting user's own permissions if their role overrides / user overrides
// were replaced — used to stop a non-admin from removing their own access to
// this page.
function actorKeepsManagePermissions(
  actor: CurrentUser,
  roleOverrides: OverrideRow[],
  userOverrides: OverrideRow[],
) {
  if (actor.role === UserRole.ADMIN) {
    return true;
  }
  return (
    resolvePermissions({
      role: actor.role,
      roleOverrides,
      userOverrides,
      legacyCapabilities: actor.capabilities,
    })["function.managePermissions"] === true
  );
}

const SELF_LOCKOUT_ERROR =
  "Tímto byste si odebrali přístup ke správě oprávnění. Požádejte administrátora.";

// --- Role matrix --------------------------------------------------------------

export async function saveRolePermissions(
  _previous: PermissionFormState,
  formData: FormData,
): Promise<PermissionFormState> {
  try {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();
    assertCanManagePermissions(currentUser);
    const organizationId = currentUser.organizationId;
    const actorIsAdmin = isAdmin(currentUser);

    const defs = submittedDefs(formData);
    const existing = await loadRoleOverrides(organizationId);

    type Change = { role: UserRole; def: PermissionDef; from: PermissionValue; to: PermissionValue };
    const changes: Change[] = [];

    for (const role of EDITABLE_ROLES) {
      const roleRows = existing.filter((row) => row.role === role);
      const current = resolvePermissions({ role, roleOverrides: roleRows });
      for (const def of defs) {
        const raw = formData.get(`${role}:${def.key}`);
        let next: PermissionValue;
        if (def.kind === "scope") {
          const parsed =
            typeof raw === "string" ? parsePermissionValue(def, raw) : undefined;
          if (parsed === undefined) {
            continue; // missing or forged value → keep the current setting
          }
          next = parsed;
        } else {
          next = raw === "ALLOW";
        }
        const from = current[def.key];
        if (valuesEqual(from, next)) {
          continue;
        }
        if (def.kind === "function" && def.adminOnlyEdit && !actorIsAdmin) {
          // Disabled for non-admins in the UI; a submitted change is forged.
          return failed(
            `Oprávnění „${def.label}“ může měnit jen administrátor.`,
          );
        }
        changes.push({ role, def, from, to: next });
      }
    }

    if (changes.length === 0) {
      return done("Žádná změna.");
    }

    // Resulting override rows (row absent = default) for the lock-out check.
    const nextRows = new Map(
      existing.map((row) => [`${row.role}:${row.permission}`, row]),
    );
    for (const change of changes) {
      const id = `${change.role}:${change.def.key}`;
      if (valuesEqual(change.to, change.def.defaults[change.role])) {
        nextRows.delete(id);
      } else {
        nextRows.set(id, {
          role: change.role,
          permission: change.def.key,
          value: serializePermissionValue(change.to),
        });
      }
    }
    const actorRoleRows = [...nextRows.values()].filter(
      (row) => row.role === currentUser.role,
    );
    const actorUserRows = await loadUserOverrides(organizationId, currentUser.id);
    if (!actorKeepsManagePermissions(currentUser, actorRoleRows, actorUserRows)) {
      return failed(SELF_LOCKOUT_ERROR);
    }

    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        const where = {
          organizationId_role_permission: {
            organizationId,
            role: change.role,
            permission: change.def.key,
          },
        };
        if (valuesEqual(change.to, change.def.defaults[change.role])) {
          await tx.rolePermissionOverride.deleteMany({
            where: {
              organizationId,
              role: change.role,
              permission: change.def.key,
            },
          });
        } else {
          const value = serializePermissionValue(change.to);
          await tx.rolePermissionOverride.upsert({
            where,
            update: { value, updatedById: currentUser.id },
            create: {
              organizationId,
              role: change.role,
              permission: change.def.key,
              value,
              updatedById: currentUser.id,
            },
          });
        }
      }

      for (const role of EDITABLE_ROLES) {
        const roleChanges = changes.filter((change) => change.role === role);
        if (roleChanges.length === 0) {
          continue;
        }
        await tx.auditLog.create(
          auditEntry({
            organizationId,
            entityType: "RolePermission",
            entityId: role,
            action: "UPDATE",
            changedById: currentUser.id,
            oldValue: {
              role,
              changes: Object.fromEntries(
                roleChanges.map((change) => [change.def.key, change.from]),
              ),
            },
            newValue: {
              role,
              changes: Object.fromEntries(
                roleChanges.map((change) => [change.def.key, change.to]),
              ),
            },
          }),
        );
      }
    });

    revalidateEverything();
    return done("Oprávnění uložena.");
  } catch (error) {
    return failed(errorMessage(error));
  }
}

export async function resetRolePermissions(
  _previous: PermissionFormState,
  formData: FormData,
): Promise<PermissionFormState> {
  try {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();
    assertCanManagePermissions(currentUser);
    const organizationId = currentUser.organizationId;
    const role = formData.get("role");
    if (!isEditableRole(role)) {
      return failed("Neplatná role.");
    }
    const actorIsAdmin = isAdmin(currentUser);

    const existing = (await loadRoleOverrides(organizationId)).filter(
      (row) => row.role === role,
    );
    // A non-admin can't touch admin-only permissions, not even by a reset.
    const removable = existing.filter((row) => {
      const def = getPermissionDef(row.permission);
      return actorIsAdmin || !(def?.kind === "function" && def.adminOnlyEdit);
    });
    if (removable.length === 0) {
      return done(
        `Role ${permissionRoleLabels[role]} už má výchozí oprávnění.`,
      );
    }

    if (role === currentUser.role) {
      const kept = existing.filter((row) => !removable.includes(row));
      const actorUserRows = await loadUserOverrides(organizationId, currentUser.id);
      if (!actorKeepsManagePermissions(currentUser, kept, actorUserRows)) {
        return failed(SELF_LOCKOUT_ERROR);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.rolePermissionOverride.deleteMany({
        where: {
          organizationId,
          role,
          permission: { in: removable.map((row) => row.permission) },
        },
      });
      await tx.auditLog.create(
        auditEntry({
          organizationId,
          entityType: "RolePermission",
          entityId: role,
          action: "RESET",
          changedById: currentUser.id,
          oldValue: {
            role,
            changes: Object.fromEntries(
              removable.map((row) => [row.permission, row.value]),
            ),
          },
          newValue: { role, changes: {} },
        }),
      );
    });

    revalidateEverything();
    return done(
      `Oprávnění role ${permissionRoleLabels[role]} byla obnovena na výchozí.`,
    );
  } catch (error) {
    return failed(errorMessage(error));
  }
}

// --- Per-user overrides ---------------------------------------------------------

async function loadTargetMember(currentUser: CurrentUser, userId: string) {
  const membership = await getPrisma().organizationMember.findFirst({
    where: {
      userId,
      organizationId: currentUser.organizationId,
      status: OrganizationMemberStatus.ACTIVE,
    },
    select: { role: true, user: { select: { name: true } } },
  });
  if (!membership) {
    throw new Error("Uživatel nepatří do vaší kanceláře.");
  }
  if (membership.role === UserRole.ADMIN) {
    throw new Error("Administrátor má vždy plný přístup.");
  }
  if (userId === currentUser.id && !isAdmin(currentUser)) {
    throw new Error("Vlastní oprávnění vám může upravit jen administrátor.");
  }
  return membership;
}

// Current per-user values as the overrides page shows them: explicit override
// rows plus legacy grants (an ALLOW where no override row exists).
async function currentUserOverrideMap(organizationId: string, userId: string) {
  const [rows, legacy] = await Promise.all([
    loadUserOverrides(organizationId, userId),
    loadLegacyCapabilities(organizationId, userId),
  ]);
  const map = new Map<string, string>(rows.map((row) => [row.permission, row.value]));
  for (const def of editablePermissionDefs()) {
    const capability = legacyCapabilityForPermission(def.key);
    if (capability && legacy.includes(capability) && !map.has(def.key)) {
      map.set(def.key, "ALLOW");
    }
  }
  return { map, legacy };
}

export async function saveUserPermissionOverrides(
  _previous: PermissionFormState,
  formData: FormData,
): Promise<PermissionFormState> {
  try {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();
    assertCanManagePermissions(currentUser);
    const organizationId = currentUser.organizationId;
    const userId = formData.get("userId");
    if (typeof userId !== "string" || !userId) {
      return failed("Chybí uživatel.");
    }
    await loadTargetMember(currentUser, userId);
    const actorIsAdmin = isAdmin(currentUser);

    const defs = submittedDefs(formData);
    const { map: current, legacy } = await currentUserOverrideMap(
      organizationId,
      userId,
    );

    type Change = { key: PermissionKey; from: string; to: string };
    const changes: Change[] = [];
    for (const def of defs) {
      const raw = formData.get(def.key);
      if (typeof raw !== "string") {
        continue;
      }
      const next =
        raw === INHERIT
          ? INHERIT
          : parsePermissionValue(def, raw) === undefined
            ? null
            : raw;
      if (next === null) {
        continue; // forged value
      }
      const from = current.get(def.key) ?? INHERIT;
      if (from === next) {
        continue;
      }
      if (def.kind === "function" && def.adminOnlyEdit && !actorIsAdmin) {
        return failed(`Oprávnění „${def.label}“ může měnit jen administrátor.`);
      }
      changes.push({ key: def.key, from, to: next });
    }

    if (changes.length === 0) {
      return done("Žádná změna.");
    }

    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        if (change.to === INHERIT) {
          await tx.userPermissionOverride.deleteMany({
            where: { organizationId, userId, permission: change.key },
          });
        } else {
          await tx.userPermissionOverride.upsert({
            where: {
              organizationId_userId_permission: {
                organizationId,
                userId,
                permission: change.key,
              },
            },
            update: { value: change.to, updatedById: currentUser.id },
            create: {
              organizationId,
              userId,
              permission: change.key,
              value: change.to,
              updatedById: currentUser.id,
            },
          });
        }

        // Dual-write the deprecated grants so the old table stays truthful
        // (rollback safety): ALLOW keeps a grant, anything else removes it.
        const capability = legacyCapabilityForPermission(change.key);
        if (capability) {
          if (change.to === "ALLOW") {
            await tx.userCapabilityGrant.upsert({
              where: { userId_capability: { userId, capability } },
              update: { organizationId, grantedById: currentUser.id },
              create: {
                organizationId,
                userId,
                capability,
                grantedById: currentUser.id,
              },
            });
          } else if (legacy.includes(capability)) {
            await tx.userCapabilityGrant.deleteMany({
              where: { userId, capability, organizationId },
            });
          }
        }
      }

      await tx.auditLog.create(
        auditEntry({
          organizationId,
          entityType: "UserPermission",
          entityId: userId,
          action: "UPDATE",
          changedById: currentUser.id,
          oldValue: {
            userId,
            changes: Object.fromEntries(changes.map((c) => [c.key, c.from])),
          },
          newValue: {
            userId,
            changes: Object.fromEntries(changes.map((c) => [c.key, c.to])),
          },
        }),
      );
    });

    revalidateEverything();
    return done("Výjimky uloženy.");
  } catch (error) {
    return failed(errorMessage(error));
  }
}

export async function resetUserPermissionOverrides(
  _previous: PermissionFormState,
  formData: FormData,
): Promise<PermissionFormState> {
  try {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();
    assertCanManagePermissions(currentUser);
    const organizationId = currentUser.organizationId;
    const userId = formData.get("userId");
    if (typeof userId !== "string" || !userId) {
      return failed("Chybí uživatel.");
    }
    await loadTargetMember(currentUser, userId);
    const actorIsAdmin = isAdmin(currentUser);

    const { map: current, legacy } = await currentUserOverrideMap(
      organizationId,
      userId,
    );
    const removable = [...current.entries()].filter(([key]) => {
      const def = getPermissionDef(key);
      return actorIsAdmin || !(def?.kind === "function" && def.adminOnlyEdit);
    });
    if (removable.length === 0) {
      return done("Uživatel nemá žádné výjimky.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({
        where: {
          organizationId,
          userId,
          permission: { in: removable.map(([key]) => key) },
        },
      });
      if (legacy.length > 0) {
        await tx.userCapabilityGrant.deleteMany({
          where: { organizationId, userId },
        });
      }
      await tx.auditLog.create(
        auditEntry({
          organizationId,
          entityType: "UserPermission",
          entityId: userId,
          action: "RESET",
          changedById: currentUser.id,
          oldValue: { userId, changes: Object.fromEntries(removable) },
          newValue: { userId, changes: {} },
        }),
      );
    });

    revalidateEverything();
    return done("Všechny výjimky uživatele byly zrušeny.");
  } catch (error) {
    return failed(errorMessage(error));
  }
}
