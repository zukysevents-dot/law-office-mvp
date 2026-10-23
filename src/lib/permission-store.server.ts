import "server-only";

import {
  UserRole as UserRoleEnum,
  type Capability,
  type UserRole,
} from "@/generated/prisma/enums";
import { privilegedTargetDenial } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  resolvePermissions,
  type EffectivePermissions,
  type OverrideRow,
} from "@/lib/permission-resolver";

type Db = ReturnType<typeof getPrisma>;

export type RoleOverrideRow = OverrideRow & { role: UserRole };

// All role-level overrides of one office (every role).
export async function loadRoleOverrides(
  organizationId: string,
  db: Db = getPrisma(),
): Promise<RoleOverrideRow[]> {
  return db.rolePermissionOverride.findMany({
    where: { organizationId },
    select: { role: true, permission: true, value: true },
  });
}

// Overrides of one user in one office.
export async function loadUserOverrides(
  organizationId: string,
  userId: string,
  db: Db = getPrisma(),
): Promise<OverrideRow[]> {
  return db.userPermissionOverride.findMany({
    where: { organizationId, userId },
    select: { permission: true, value: true },
  });
}

// Legacy per-user grants (deprecated table, still read as an ALLOW fallback).
export async function loadLegacyCapabilities(
  organizationId: string,
  userId: string,
  db: Db = getPrisma(),
): Promise<Capability[]> {
  const grants = await db.userCapabilityGrant.findMany({
    where: { organizationId, userId },
    select: { capability: true },
  });
  return grants.map((grant) => grant.capability);
}

// Matrix of a role in one office (role defaults + role overrides, no user
// overrides) — e.g. for a user who is being created with that role.
export async function loadRolePermissions(
  organizationId: string,
  role: UserRole,
  db: Db = getPrisma(),
): Promise<EffectivePermissions> {
  const roleOverrides = await db.rolePermissionOverride.findMany({
    where: { organizationId, role },
    select: { permission: true, value: true },
  });
  return resolvePermissions({ role, roleOverrides });
}

// Effective permission set of a member: three small indexed reads in parallel,
// then the pure resolver. Called once per request from getCurrentUser().
export async function loadEffectivePermissions(input: {
  organizationId: string;
  userId: string;
  role: UserRole;
  db?: Db;
}): Promise<{
  permissions: EffectivePermissions;
  capabilities: Capability[];
}> {
  const db = input.db ?? getPrisma();
  const [roleOverrides, userOverrides, capabilities] = await Promise.all([
    db.rolePermissionOverride.findMany({
      where: { organizationId: input.organizationId, role: input.role },
      select: { permission: true, value: true },
    }),
    loadUserOverrides(input.organizationId, input.userId, db),
    loadLegacyCapabilities(input.organizationId, input.userId, db),
  ]);
  return {
    permissions: resolvePermissions({
      role: input.role,
      roleOverrides,
      userOverrides,
      legacyCapabilities: capabilities,
    }),
    capabilities,
  };
}

// For the users / members UI: which roles the actor may assign and which
// members they may act on (reset password, change role, deactivate) — the same
// rule the actions enforce (privilegedTargetDenial; it is identical for all
// three actions). Two small reads, only for a non-admin actor.
export async function loadPrivilegeTargets(input: {
  actor: Parameters<typeof privilegedTargetDenial>[0];
  organizationId: string;
  members: Array<{ id: string; role: UserRole }>;
  db?: Db;
}): Promise<{ assignableRoles: UserRole[]; manageableUserIds: string[] }> {
  const { actor, organizationId, members } = input;
  const allRoles = Object.values(UserRoleEnum);
  const actorRole = typeof actor === "string" ? actor : actor?.role;
  const isPlatformAdmin =
    typeof actor === "object" && actor ? Boolean(actor.isPlatformAdmin) : false;
  if (isPlatformAdmin || actorRole === UserRoleEnum.ADMIN) {
    return {
      assignableRoles: allRoles,
      manageableUserIds: members.map((member) => member.id),
    };
  }

  const db = input.db ?? getPrisma();
  const [roleOverrides, userOverrides] = await Promise.all([
    loadRoleOverrides(organizationId, db),
    db.userPermissionOverride.findMany({
      where: { organizationId },
      select: { userId: true, permission: true, value: true },
    }),
  ]);
  const roleRows = (role: UserRole) =>
    roleOverrides.filter((row) => row.role === role);

  const assignableRoles = allRoles.filter(
    (role) =>
      !privilegedTargetDenial(
        actor,
        {
          role,
          permissions: resolvePermissions({
            role,
            roleOverrides: roleRows(role),
          }),
        },
        "assignRole",
      ),
  );
  const manageableUserIds = members
    .filter(
      (member) =>
        !privilegedTargetDenial(
          actor,
          {
            role: member.role,
            permissions: resolvePermissions({
              role: member.role,
              roleOverrides: roleRows(member.role),
              userOverrides: userOverrides.filter(
                (row) => row.userId === member.id,
              ),
            }),
          },
          "assignRole",
        ),
    )
    .map((member) => member.id);
  return { assignableRoles, manageableUserIds };
}
