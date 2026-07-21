import { updateOrganizationBilling } from "@/app/actions/organizations";
import { Field, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { OrganizationAdminPanel } from "@/components/organization-admin";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { getOrganizationAdminData } from "@/lib/organization";
import { canViewAllLegalData } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type OrgSettingsData = Awaited<ReturnType<typeof getOrganizationAdminData>> & {
  allowed: boolean;
  currentUserId: string;
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
      };
    }

    const data = await getOrganizationAdminData(currentUser.organizationId);
    return { ...data, allowed: true, currentUserId: currentUser.id };
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
          <Section title="Fakturační údaje">
            <p className="mb-4 text-sm text-stone-600">
              Údaje dodavatele na fakturách, které kancelář vystavuje. Bez IČO a
              bankovního účtu nelze fakturu vytvořit.
            </p>
            <form action={updateOrganizationBilling} className="grid gap-4">
              <input
                type="hidden"
                name="organizationId"
                value={data.organization.id}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="IČO">
                  <TextInput name="ico" defaultValue={data.organization.ico ?? ""} />
                </Field>
                <Field label="DIČ">
                  <TextInput name="dic" defaultValue={data.organization.dic ?? ""} />
                </Field>
              </div>
              <Field label="Adresa">
                <TextInput
                  name="address"
                  defaultValue={data.organization.address ?? ""}
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="E-mail">
                  <TextInput
                    name="email"
                    type="email"
                    defaultValue={data.organization.email ?? ""}
                  />
                </Field>
                <Field label="Telefon">
                  <TextInput
                    name="phone"
                    defaultValue={data.organization.phone ?? ""}
                  />
                </Field>
              </div>
              <Field label="Bankovní účet">
                <TextInput
                  name="bankAccount"
                  defaultValue={data.organization.bankAccount ?? ""}
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm font-medium text-[#072924]">
                  <input
                    type="checkbox"
                    name="vatPayer"
                    defaultChecked={data.organization.vatPayer}
                    className="h-4 w-4"
                  />
                  Plátce DPH
                </label>
                <Field label="Sazba DPH (%)">
                  <TextInput
                    name="vatRate"
                    type="number"
                    min="0"
                    defaultValue={String(data.organization.vatRate)}
                  />
                </Field>
                <Field label="Splatnost (dní)">
                  <TextInput
                    name="invoiceDueDays"
                    type="number"
                    min="1"
                    defaultValue={String(data.organization.invoiceDueDays)}
                  />
                </Field>
              </div>
              <div>
                <Button type="submit">Uložit fakturační údaje</Button>
              </div>
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
        </>
      ) : null}
    </>
  );
}
