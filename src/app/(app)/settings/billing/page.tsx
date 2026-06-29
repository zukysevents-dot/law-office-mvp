import { saveBillingProfile } from "@/app/actions/billing-profile";
import {
  archiveBillingIssuer,
  createBillingIssuer,
} from "@/app/actions/billing-issuers";
import { Field, TextInput, TextArea } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { OrganizationBillingProfile } from "@/generated/prisma/client";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type BillingIssuerRow = {
  id: string;
  legalName: string;
  ico: string | null;
  dic: string | null;
  vatPayer: boolean;
};

type BillingProfileData = {
  allowed: boolean;
  profile: OrganizationBillingProfile | null;
  issuers: BillingIssuerRow[];
};

export default async function BillingSettingsPage() {
  const result = await safeQuery<BillingProfileData>(
    { allowed: false, profile: null, issuers: [] },
    async () => {
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.BILLING);
      if (!canViewAllLegalData(currentUser)) {
        return { allowed: false, profile: null, issuers: [] };
      }
      const prisma = getPrisma();
      const [profile, issuers] = await Promise.all([
        prisma.organizationBillingProfile.findUnique({
          where: { organizationId: currentUser.organizationId },
        }),
        prisma.billingIssuer.findMany({
          where: {
            organizationId: currentUser.organizationId,
            archivedAt: null,
          },
          orderBy: { legalName: "asc" },
          select: {
            id: true,
            legalName: true,
            ico: true,
            dic: true,
            vatPayer: true,
          },
        }),
      ]);
      return { allowed: true, profile, issuers };
    },
  );

  const data = result.data;
  const profile = data?.profile ?? null;
  const issuers = data?.issuers ?? [];

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
            <Field label="Prefix čísla faktury">
              <TextInput
                name="invoicePrefix"
                defaultValue={profile?.invoicePrefix ?? "AK"}
                placeholder="AK"
              />
              <p className="mt-1 text-xs text-[#5f756e]">
                Číslo faktury má tvar PREFIX_ROK_MĚSÍC_pořadové (např.
                AK_2026_06_0001). Prázdný prefix → ROK_MĚSÍC_pořadové.
              </p>
            </Field>
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

      {data && data.allowed ? (
        <Section title="Další fakturující subjekty">
          <p className="mb-4 text-sm text-[#5f756e]">
            Kromě hlavního profilu kanceláře lze fakturovat i pod dalšími
            subjekty (jednotliví advokáti, poradenská společnost). U konkrétní
            faktury se vybere, kdo ji vystavuje.
          </p>
          {issuers.length > 0 ? (
            <div className="mb-6 table-scroll">
              <table className="w-max min-w-full">
                <thead>
                  <tr>
                    <th>Obchodní jméno</th>
                    <th>IČO</th>
                    <th>DIČ</th>
                    <th>DPH</th>
                    <th>Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {issuers.map((issuer) => (
                    <tr key={issuer.id}>
                      <td className="font-medium text-emerald-950">
                        {issuer.legalName}
                      </td>
                      <td>{issuer.ico ?? "—"}</td>
                      <td>{issuer.dic ?? "—"}</td>
                      <td>{issuer.vatPayer ? "Plátce" : "Neplátce"}</td>
                      <td>
                        <form action={archiveBillingIssuer}>
                          <input type="hidden" name="id" value={issuer.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            className="h-8 px-3"
                          >
                            Odebrat
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>
              Zatím nejsou žádné další fakturující subjekty.
            </EmptyState>
          )}
          <form action={createBillingIssuer} className="grid gap-4">
            <Field label="Obchodní jméno">
              <TextInput name="legalName" required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="IČO">
                <TextInput name="ico" />
              </Field>
              <Field label="DIČ">
                <TextInput name="dic" />
              </Field>
            </div>
            <Field label="Adresa">
              <TextInput name="address" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bankovní účet">
                <TextInput name="bankAccount" />
              </Field>
              <Field label="IBAN">
                <TextInput name="iban" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-[#072924]">
              <input
                type="checkbox"
                name="vatPayer"
                className="h-4 w-4 rounded border-[#cfe0d7] text-[#072924] focus:ring-[#B9DCC6]"
              />
              <span>Subjekt je plátce DPH</span>
            </label>
            <div>
              <Button type="submit">Přidat fakturující subjekt</Button>
            </div>
          </form>
        </Section>
      ) : null}
    </>
  );
}
