import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { OrganizationAdminPanel } from "@/components/organization-admin";
import { OrganizationModulesOverview } from "@/components/organization-modules-overview";
import { LegalTeamAdmin } from "@/components/legal-team-admin";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import {
  getOrganizationAdminData,
  getOrganizationEntitlements,
  getLegalTeamAdminData,
} from "@/lib/organization";
import { canViewAllLegalData } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type OrgSettingsData = Awaited<ReturnType<typeof getOrganizationAdminData>> & {
  allowed: boolean;
  currentUserId: string;
  entitlements: Awaited<ReturnType<typeof getOrganizationEntitlements>> | null;
  legalTeams: Awaited<ReturnType<typeof getLegalTeamAdminData>> | null;
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
        legalTeams: null,
      };
    }

    const [adminData, entitlements, legalTeams] = await Promise.all([
      getOrganizationAdminData(currentUser.organizationId),
      getOrganizationEntitlements(currentUser.organizationId),
      getLegalTeamAdminData(currentUser.organizationId),
    ]);
    return {
      ...adminData,
      allowed: true,
      currentUserId: currentUser.id,
      entitlements,
      legalTeams,
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
            <p className="text-lg font-semibold text-[#0e1822]">
              {data.organization.name}
            </p>
            <p className="text-sm text-stone-600">
              Limit účtů spravuje správce platformy. Pro navýšení počtu míst
              kontaktujte podporu.
            </p>
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
          />
          {data.legalTeams ? (
            <LegalTeamAdmin
              organizationId={data.organization.id}
              teams={data.legalTeams.teams}
              users={data.legalTeams.users}
            />
          ) : null}
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
