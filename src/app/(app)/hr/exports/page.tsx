import { Field, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { canManageHr } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function HrExportsPage() {
  const result = await safeQuery<{ canManage: boolean }>(
    { canManage: false },
    async () => {
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
      return { canManage: canManageHr(currentUser) };
    },
  );

  const canManage = result.data?.canManage ?? false;

  return (
    <>
      <PageHeader
        title="Mzdový export"
        description="Souhrn odpracovaných hodin a absencí za období (CSV)."
      />

      {canManage ? (
        <Section title="Export za období">
          <form method="get" action="/hr/exports/payroll" className="flex flex-wrap items-end gap-3">
            <Field label="Od">
              <TextInput name="from" type="date" required />
            </Field>
            <Field label="Do">
              <TextInput name="to" type="date" required />
            </Field>
            <Button type="submit">Stáhnout CSV</Button>
          </form>
          <p className="mt-3 text-xs text-stone-400">
            CSV obsahuje za každého zaměstnance součet odpracovaných hodin,
            dovolené, nemoci a ostatních schválených absencí. Nativní formát pro
            Pamicu je plánované rozšíření.
          </p>
        </Section>
      ) : (
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            Mzdový export je dostupný pouze pro správce HR (admin/partner).
          </p>
        </Section>
      )}
    </>
  );
}
