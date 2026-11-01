import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { OrganizationAdminPanel } from "@/components/organization-admin";
import { OrganizationModulesOverview } from "@/components/organization-modules-overview";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { Button, ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import {
  getOrganizationAdminData,
  getOrganizationEntitlements,
} from "@/lib/organization";
import { canManageOrganization } from "@/lib/permissions";
import { loadPrivilegeTargets } from "@/lib/permission-store.server";
import type { UserRole } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type OrgSettingsData = Awaited<ReturnType<typeof getOrganizationAdminData>> & {
  allowed: boolean;
  // Role, které smí aktuální uživatel přidělit, a členové, jejichž roli smí
  // měnit / deaktivovat (bez eskalace práv — server to hlídá znovu).
  assignableRoles: UserRole[];
  manageableUserIds: string[];
  currentUserId: string;
  entitlements: Awaited<ReturnType<typeof getOrganizationEntitlements>> | null;
};

export default async function OrganizationSettingsPage() {
  const result = await safeQuery<OrgSettingsData | null>(null, async () => {
    const currentUser = await getCurrentUser();
    if (!canManageOrganization(currentUser)) {
      return {
        allowed: false,
        assignableRoles: [],
        manageableUserIds: [],
        currentUserId: currentUser.id,
        organization: null,
        members: [],
        joinCodes: [],
        activeMembers: 0,
        entitlements: null,
      };
    }

    const [adminData, entitlements] = await Promise.all([
      getOrganizationAdminData(currentUser.organizationId),
      getOrganizationEntitlements(currentUser.organizationId),
    ]);
    const privilegeTargets = await loadPrivilegeTargets({
      actor: currentUser,
      organizationId: currentUser.organizationId,
      members: adminData.members.map((member) => ({
        id: member.userId,
        role: member.role,
      })),
    });
    return {
      ...adminData,
      allowed: true,
      assignableRoles: privilegeTargets.assignableRoles,
      manageableUserIds: privilegeTargets.manageableUserIds,
      currentUserId: currentUser.id,
      entitlements,
    };
  });

  const data = result.data;

  return (
    <>
      <PageHeader
        title="Nastavení kanceláře"
        description="Správa členů kanceláře, jejich rolí a registračních kódů pro připojení nových uživatelů."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {result.databaseReady && data && !data.allowed ? (
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            Správa kanceláře je dostupná uživatelům s oprávněním „Spravuje nastavení kanceláře“.
          </p>
        </Section>
      ) : null}

      {data && data.allowed && data.organization ? (
        <>
          <Section title="Kancelář">
            <p className="text-lg font-semibold text-[#0e1822]">
              {data.organization.name}
            </p>
            {data.organization.seatLimit !== null ? (
              <p className="text-sm text-stone-600">
                Limit účtů spravuje správce platformy. Pro navýšení počtu míst
                kontaktujte podporu.
              </p>
            ) : null}
            <form
              action={updateBillingTimeIncrement}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <input
                type="hidden"
                name="organizationId"
                value={data.organization.id}
              />
              <Field label="Zaokrouhlení vykázaného času">
                <SelectInput
                  name="billingTimeIncrementMinutes"
                  defaultValue={String(
                    data.organization.billingTimeIncrementMinutes,
                  )}
                >
                  <option value="6">0,1 hodiny (6 minut)</option>
                  <option value="15">0,25 hodiny (15 minut)</option>
                </SelectInput>
              </Field>
              <Button type="submit" variant="secondary">
                Uložit zaokrouhlení
              </Button>
            </form>
          </Section>
          <OrganizationAdminPanel
            organizationId={data.organization.id}
            seatLimit={data.organization.seatLimit}
            activeMembers={data.activeMembers}
            members={data.members}
            joinCodes={data.joinCodes}
            currentUserId={data.currentUserId}
            assignableRoles={data.assignableRoles}
            manageableUserIds={data.manageableUserIds}
          />
          <Section title="Právní týmy">
            <p className="text-sm text-stone-600">
              Týmy a jejich přiřazení k projektům a případům spravujete na
              stránce Týmy a řešitelé.
            </p>
            <ButtonLink
              href="/settings/assignments"
              variant="secondary"
              className="mt-3"
            >
              Otevřít Týmy a řešitelé
            </ButtonLink>
          </Section>
          {data.entitlements ? (
            <OrganizationModulesOverview
              modules={data.entitlements.modules}
              subscription={data.entitlements.subscription}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
import { updateBillingTimeIncrement } from "@/app/actions/organizations";
import { Field, SelectInput } from "@/components/form-field";
