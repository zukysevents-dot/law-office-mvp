import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { canManageHr, hrEmployeeVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { AccessDenied } from "@/components/access-denied";
import { moduleAccessDenial } from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

export default async function HrExportsPage() {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.hr");
  if (accessDenied) {
    return <AccessDenied title="Mzdový export" message={accessDenied} />;
  }

  type Data = {
    canManage: boolean;
    employees: Array<{
      id: string;
      firstName: string;
      lastName: string;
      archivedAt: Date | null;
    }>;
  };
  const result = await safeQuery<Data>(
    { canManage: false, employees: [] },
    async () => {
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
      const canManage = canManageHr(currentUser);
      const employees = canManage
        ? await getPrisma().hrEmployee.findMany({
            where: hrEmployeeVisibilityWhere(currentUser),
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
            select: { id: true, firstName: true, lastName: true, archivedAt: true },
          })
        : [];
      return { canManage, employees };
    },
  );

  const canManage = result.data?.canManage ?? false;
  const employees = result.data?.employees ?? [];

  return (
    <>
      <PageHeader
        title="Mzdový export"
        description="Souhrn odpracovaných hodin a absencí za období (CSV) a export docházky po dnech."
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
          <p className="mt-3 text-xs text-stone-600">
            CSV obsahuje za každého zaměstnance součet odpracovaných hodin,
            dovolené, nemoci a ostatních schválených absencí. Nativní formát pro
            Pamicu je plánované rozšíření.
          </p>
        </Section>
      ) : null}

      {canManage ? (
        <Section title="Export docházky">
          <form method="get" action="/hr/attendance/export" className="flex flex-wrap items-end gap-3">
            <Field label="Od">
              <TextInput name="from" type="date" />
            </Field>
            <Field label="Do">
              <TextInput name="to" type="date" />
            </Field>
            <Field label="Zaměstnanec">
              <SelectInput name="employeeId" defaultValue="">
                <option value="">Všichni zaměstnanci</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.lastName} {employee.firstName}
                    {employee.archivedAt ? " (archivováno)" : ""}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Formát">
              <SelectInput name="format" defaultValue="xlsx">
                <option value="xlsx">Excel (XLSX)</option>
                <option value="csv">CSV</option>
              </SelectInput>
            </Field>
            <Button type="submit">Stáhnout docházku</Button>
          </form>
          <p className="mt-3 text-xs text-stone-600">
            Jednotlivé dny docházky (příchod, odchod, přestávka, odpracováno)
            za zvolené období a zaměstnance. Prázdné období = všechny záznamy.
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
