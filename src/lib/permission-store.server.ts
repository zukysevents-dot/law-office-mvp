import "server-only";

import type { Capability, UserRole } from "@/generated/prisma/enums";
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
