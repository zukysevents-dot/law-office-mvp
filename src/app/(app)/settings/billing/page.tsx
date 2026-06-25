import { saveBillingProfile } from "@/app/actions/billing-profile";
import { Field, TextInput, TextArea } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import type { OrganizationBillingProfile } from "@/generated/prisma/client";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type BillingProfileData = {
  allowed: boolean;
  profile: OrganizationBillingProfile | null;
};

export default async function BillingSettingsPage() {
  const result = await safeQuery<BillingProfileData>(
    { allowed: false, profile: null },
    async () => {
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.BILLING);
      if (!canViewAllLegalData(currentUser)) {
        return { allowed: false, profile: null };
      }
      const profile = await getPrisma().organizationBillingProfile.findUnique({
        where: { organizationId: currentUser.organizationId },
      });
      return { allowed: true, profile };
    },
  );

  const data = result.data;
  const profile = data?.profile ?? null;

  return (
    <>
      <PageHeader
        title="Fakturační údaje kanceláře"
        description="Identita vystavitele na fakturách: obchodní jméno, IČO/DIČ, adresa, bankovní spojení a režim DPH."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {result.databaseReady && data && !data.allowed ? (
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            Fakturační údaje může spravovat pouze partner nebo administrátor.
          </p>
        </Section>
      ) : null}

      {data && data.allowed ? (
        <Section title="Údaje vystavitele">
          <form action={saveBillingProfile} className="grid gap-4">
            <Field label="Obchodní jméno">
              <TextInput
                name="legalName"
                required
                defaultValue={profile?.legalName ?? ""}
                placeholder="Advokátní kancelář …"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="IČO">
                <TextInput name="ico" defaultValue={profile?.ico ?? ""} />
              </Field>
              <Field label="DIČ">
                <TextInput name="dic" defaultValue={profile?.dic ?? ""} />
              </Field>
            </div>
            <Field label="Adresa">
              <TextArea
                name="address"
                defaultValue={profile?.address ?? ""}
                placeholder="Ulice a č. p., město, PSČ"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bankovní účet">
                <TextInput
                  name="bankAccount"
                  defaultValue={profile?.bankAccount ?? ""}
                  placeholder="123456789/0100"
                />
              </Field>
              <Field label="IBAN">
                <TextInput name="iban" defaultValue={profile?.iban ?? ""} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Výchozí splatnost (dní)">
                <TextInput
                  name="defaultDueDays"
                  type="number"
                  min={0}
                  defaultValue={String(profile?.defaultDueDays ?? 14)}
                />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-[#072924]">
                <input
                  type="checkbox"
                  name="vatPayer"
                  defaultChecked={profile?.vatPayer ?? false}
                  className="h-4 w-4 rounded border-[#cfe0d7] text-[#072924] focus:ring-[#B9DCC6]"
                />
                <span>Kancelář je plátce DPH</span>
              </label>
            </div>
            <Field label="Patička / standardní text na faktuře">
              <TextArea
                name="invoiceNote"
                defaultValue={profile?.invoiceNote ?? ""}
              />
            </Field>
            <div>
              <Button type="submit">Uložit fakturační údaje</Button>
            </div>
          </form>
        </Section>
      ) : null}
    </>
  );
}
