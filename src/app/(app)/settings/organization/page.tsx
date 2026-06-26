import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { OrganizationAdminPanel } from "@/components/organization-admin";
import { OrganizationModulesOverview } from "@/components/organization-modules-overview";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import {
  getOrganizationAdminData,
  getOrganizationEntitlements,
} from "@/lib/organization";
import { canViewAllLegalData } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type OrgSettingsData = Awaited<ReturnType<typeof getOrganizationAdminData>> & {
  allowed: boolean;
  currentUserId: string;
  entitlements: Awaited<ReturnType<typeof getOrganizationEntitlements>> | null;
};

export default async function OrganizationSettingsPage() {
  const result = await safeQuery<OrgSettingsData | null>(null, async () => {
    const currentUser = await getCurrentUser();
    if (!canViewAllLegalData(currentUser)) {
      return {
        allowed: false,
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
    return {
      ...adminData,
      allowed: true,
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
            Správa kanceláře je dostupná pouze partnerům a administrátorům.
          </p>
        </Section>
      ) : null}

      {data && data.allowed && data.organization ? (
        <>
          <Section title="Kancelář">
            <p className="text-lg font-semibold text-[#072924]">
              {data.organization.name}
            </p>
            <p className="text-sm text-stone-600">
              Limit účtů spravuje správce platformy. Pro navýšení počtu míst
              kontaktujte podporu.
            </p>
          </Section>
          <OrganizationAdminPanel
            organizationId={data.organization.id}
            seatLimit={data.organization.seatLimit}
            activeMembers={data.activeMembers}
            members={data.members}
            joinCodes={data.joinCodes}
            currentUserId={data.currentUserId}
          />
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
