import Link from "next/link";

import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { PermissionMatrixForm } from "@/components/permission-matrix-form";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  OrganizationMemberStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { getEnabledModules } from "@/lib/entitlements";
import {
  PERMISSION_CATALOG,
  PERMISSION_ROLES,
  permissionRoleLabels,
} from "@/lib/permission-catalog";
import {
  legacyCapabilityForPermission,
  resolvePermissions,
  type PermissionValue,
} from "@/lib/permission-resolver";
import { loadRoleOverrides } from "@/lib/permission-store.server";
import { canManagePermissions, isAdmin } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  overrideCount: number;
};

type PermissionsPageData = {
  roleValues: Record<string, Record<string, PermissionValue>>;
  inactiveEntitlements: string[];
  members: MemberRow[];
  actorIsAdmin: boolean;
  currentUserId: string;
};

const emptyData: PermissionsPageData = {
  roleValues: {},
  inactiveEntitlements: [],
  members: [],
  actorIsAdmin: false,
  currentUserId: "",
};

export default async function PermissionsPage() {
  const accessUser = await getCurrentUser();
  if (!canManagePermissions(accessUser)) {
    return (
      <AccessDenied
        title="Oprávnění"
        message="Správa oprávnění je dostupná administrátorovi a uživatelům s oprávněním „Spravuje oprávnění“."
      />
    );
  }

  const result = await safeQuery<PermissionsPageData>(emptyData, async () => {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();
    const organizationId = currentUser.organizationId;

    const [roleOverrides, enabledModules, memberships, overrides, grants] =
      await Promise.all([
        loadRoleOverrides(organizationId),
        getEnabledModules(organizationId),
        prisma.organizationMember.findMany({
          where: { organizationId, status: OrganizationMemberStatus.ACTIVE },
          orderBy: { user: { name: "asc" } },
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.userPermissionOverride.findMany({
          where: { organizationId },
          select: { userId: true, permission: true },
        }),
        prisma.userCapabilityGrant.findMany({
          where: { organizationId },
          select: { userId: true, capability: true },
        }),
      ]);

    const roleValues: PermissionsPageData["roleValues"] = {};
    for (const role of PERMISSION_ROLES) {
      roleValues[role] = {
        ...resolvePermissions({
          role,
          roleOverrides: roleOverrides.filter((row) => row.role === role),
        }),
      };
    }

    // Exceptions per user: explicit override rows + legacy grants not yet
    // mirrored as an override (each key counted once).
    const keysByUser = new Map<string, Set<string>>();
    const addKey = (userId: string, key: string) => {
      const keys = keysByUser.get(userId) ?? new Set<string>();
      keys.add(key);
      keysByUser.set(userId, keys);
    };
    for (const row of overrides) {
      addKey(row.userId, row.permission);
    }
    for (const grant of grants) {
      const key = PERMISSION_CATALOG.find(
        (def) => legacyCapabilityForPermission(def.key) === grant.capability,
      )?.key;
      if (key) {
        addKey(grant.userId, key);
      }
    }

    const inactiveEntitlements = [
      ...new Set(
        PERMISSION_CATALOG.flatMap((def) =>
          def.kind === "module" &&
          def.entitlement !== "CORE" &&
          !enabledModules.has(def.entitlement)
            ? [def.entitlement]
            : [],
        ),
      ),
    ];

    return {
      roleValues,
      inactiveEntitlements,
      members: memberships.map((membership) => ({
        id: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role,
        overrideCount: keysByUser.get(membership.user.id)?.size ?? 0,
      })),
      actorIsAdmin: isAdmin(currentUser),
      currentUserId: currentUser.id,
    };
  });

  const data = result.data;

  return (
    <>
      <PageHeader
        title="Oprávnění"
        description="Určete, co jednotlivé role v kanceláři vidí a co smějí dělat. Změny platí pro všechny uživatele dané role okamžitě. Výjimky pro konkrétního člověka nastavíte níže."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      {result.databaseReady ? (
        <>
          <Section title="Oprávnění rolí">
            <PermissionMatrixForm
              roleValues={data.roleValues}
              inactiveEntitlements={data.inactiveEntitlements}
              actorIsAdmin={data.actorIsAdmin}
            />
          </Section>
          <Section title="Výjimky pro jednotlivé uživatele">
            <p className="mb-4 max-w-3xl text-sm leading-6 text-[#566673]">
              Výjimka má přednost před nastavením role – například jednomu
              koncipientovi povolíte sazby, nebo konkrétnímu praktikantovi
              zúžíte rozsah dat. Administrátor má vždy plný přístup.
            </p>
            {data.members.length > 0 ? (
              <div className="table-scroll">
                <table className="w-max min-w-full">
                  <thead>
                    <tr>
                      <th>Jméno</th>
                      <th>Role</th>
                      <th>Počet výjimek</th>
                      <th>
                        <span className="sr-only">Akce</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map((member) => {
                      const isSelf = member.id === data.currentUserId;
                      return (
                        <tr key={member.id}>
                          <td>
                            <span className="block font-medium text-[#0e1822]">
                              {member.name}
                            </span>
                            <span className="block text-xs text-[#566673]">
                              {member.email}
                            </span>
                          </td>
                          <td>{permissionRoleLabels[member.role]}</td>
                          <td>
                            {member.role === UserRole.ADMIN ? (
                              <Badge tone="green">Plný přístup</Badge>
                            ) : member.overrideCount > 0 ? (
                              <Badge tone="blue">{member.overrideCount}</Badge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {member.role === UserRole.ADMIN ||
                            (isSelf && !data.actorIsAdmin) ? (
                              <span className="text-xs text-[#566673]">
                                {member.role === UserRole.ADMIN
                                  ? "Bez výjimek"
                                  : "Upravuje administrátor"}
                              </span>
                            ) : (
                              <Link
                                href={`/settings/permissions/users/${member.id}`}
                                className="text-sm font-medium text-[#0e1822] underline underline-offset-2 hover:text-[#0f7f7f]"
                                aria-label={`Upravit výjimky – ${member.name}`}
                              >
                                Upravit výjimky
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Kancelář zatím nemá žádné aktivní členy.</EmptyState>
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}
