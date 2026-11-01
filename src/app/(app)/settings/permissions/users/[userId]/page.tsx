import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { UserPermissionOverridesForm } from "@/components/user-permission-overrides-form";
import {
  OrganizationMemberStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import {
  editablePermissionDefs,
  permissionRoleLabels,
} from "@/lib/permission-catalog";
import {
  legacyCapabilityForPermission,
  resolvePermissions,
  type PermissionValue,
} from "@/lib/permission-resolver";
import {
  loadLegacyCapabilities,
  loadRoleOverrides,
  loadUserOverrides,
} from "@/lib/permission-store.server";
import { canManagePermissions, isAdmin } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ userId: string }>;
};

type UserPermissionsData = {
  member: { id: string; name: string; role: UserRole } | null;
  roleValues: Record<string, PermissionValue>;
  overrides: Record<string, string>;
  actorIsAdmin: boolean;
  isSelf: boolean;
};

export default async function UserPermissionsPage({ params }: PageProps) {
  const accessUser = await getCurrentUser();
  if (!canManagePermissions(accessUser)) {
    return (
      <AccessDenied
        title="Oprávnění"
        message="Správa oprávnění je dostupná administrátorovi a uživatelům s oprávněním „Spravuje oprávnění“."
      />
    );
  }

  const { userId } = await params;
  const result = await safeQuery<UserPermissionsData>(
    {
      member: null,
      roleValues: {},
      overrides: {},
      actorIsAdmin: false,
      isSelf: false,
    },
    async () => {
      const currentUser = await getCurrentUser();
      const organizationId = currentUser.organizationId;
      const membership = await getPrisma().organizationMember.findFirst({
        where: {
          organizationId,
          userId,
          status: OrganizationMemberStatus.ACTIVE,
        },
        select: { role: true, user: { select: { id: true, name: true } } },
      });
      if (!membership) {
        return {
          member: null,
          roleValues: {},
          overrides: {},
          actorIsAdmin: isAdmin(currentUser),
          isSelf: false,
        };
      }

      const [roleOverrides, userOverrides, legacy] = await Promise.all([
        loadRoleOverrides(organizationId),
        loadUserOverrides(organizationId, userId),
        loadLegacyCapabilities(organizationId, userId),
      ]);
      const roleValues = {
        ...resolvePermissions({
          role: membership.role,
          roleOverrides: roleOverrides.filter(
            (row) => row.role === membership.role,
          ),
        }),
      };
      const overrides: Record<string, string> = Object.fromEntries(
        userOverrides.map((row) => [row.permission, row.value]),
      );
      // A legacy grant without an override row is an effective "Povolit".
      for (const def of editablePermissionDefs()) {
        const capability = legacyCapabilityForPermission(def.key);
        if (capability && legacy.includes(capability) && !(def.key in overrides)) {
          overrides[def.key] = "ALLOW";
        }
      }

      return {
        member: {
          id: membership.user.id,
          name: membership.user.name,
          role: membership.role,
        },
        roleValues,
        overrides,
        actorIsAdmin: isAdmin(currentUser),
        isSelf: membership.user.id === currentUser.id,
      };
    },
  );

  if (result.databaseReady && !result.data.member) {
    notFound();
  }

  const { member, roleValues, overrides, actorIsAdmin, isSelf } = result.data;
  const back = (
    <ButtonLink href="/settings/permissions" variant="ghost">
      Zpět na oprávnění
    </ButtonLink>
  );

  return (
    <>
      <PageHeader
        title={member ? `Oprávnění: ${member.name}` : "Oprávnění uživatele"}
        description={
          member
            ? `Výjimky mají přednost před nastavením role ${permissionRoleLabels[member.role]}.`
            : undefined
        }
        action={back}
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      {member ? (
        member.role === UserRole.ADMIN ? (
          <Section title="Výjimky">
            <p className="text-sm text-[#2c3a45]">
              Administrátor má vždy plný přístup, výjimky se nenastavují.
            </p>
          </Section>
        ) : isSelf && !actorIsAdmin ? (
          <Section title="Výjimky">
            <p className="text-sm text-[#2c3a45]">
              Vlastní oprávnění vám může upravit administrátor.
            </p>
          </Section>
        ) : (
          <Section title="Výjimky">
            <UserPermissionOverridesForm
              userId={member.id}
              userName={member.name}
              roleValues={roleValues}
              overrides={overrides}
              actorIsAdmin={actorIsAdmin}
            />
          </Section>
        )
      ) : null}
    </>
  );
}
