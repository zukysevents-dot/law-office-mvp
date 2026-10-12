import { notFound } from "next/navigation";

import { updateEmployee } from "@/app/actions/hr";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  HrEmploymentType,
  ModuleKey,
  SalaryTaxMode,
} from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { dateInputValue, numberInputValue } from "@/lib/form-values";
import { hrEmploymentTypeLabels, salaryTaxModeLabels } from "@/lib/labels";
import {
  andWhere,
  canManageHr,
  hrEmployeeVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function loadEmployee(id: string) {
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
  if (!canManageHr(currentUser)) {
    return null;
  }
  const prisma = getPrisma();

  const [employee, memberRows] = await Promise.all([
    prisma.hrEmployee.findFirst({
      where: andWhere(
        { id, archivedAt: null },
        hrEmployeeVisibilityWhere(currentUser),
      ),
    }),
    prisma.organizationMember.findMany({
      where: {
        organizationId: currentUser.organizationId ?? undefined,
        status: "ACTIVE",
      },
      orderBy: { user: { name: "asc" } },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);

  return employee
    ? { employee, members: memberRows.map((row) => row.user) }
    : null;
}

export default async function HrEmployeeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await safeQuery(null, () => loadEmployee(id));

  if (result.databaseReady && !result.data) {
    notFound();
  }

  const employee = result.data?.employee;
  const members = result.data?.members ?? [];

  return (
    <>
      <PageHeader
        title="Upravit zaměstnance"
        description="Jméno, úvazek, propojení s účtem a mzdové údaje."
        action={
          <ButtonLink href="/hr/employees" variant="secondary">
            Zpět na zaměstnance
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {employee ? (
        <Section>
          <form action={updateEmployee} className="grid gap-4 sm:max-w-2xl">
            <input type="hidden" name="employeeId" value={employee.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Jméno">
                <TextInput name="firstName" defaultValue={employee.firstName} required />
              </Field>
              <Field label="Příjmení">
                <TextInput name="lastName" defaultValue={employee.lastName} required />
              </Field>
              <Field label="Osobní číslo (pro mzdy/import)">
                <TextInput
                  name="personalNumber"
                  defaultValue={employee.personalNumber ?? ""}
                />
              </Field>
              <Field label="Pozice">
                <TextInput name="position" defaultValue={employee.position ?? ""} />
              </Field>
              <Field label="Typ úvazku">
                <SelectInput
                  name="employmentType"
                  defaultValue={employee.employmentType}
                >
                  {Object.values(HrEmploymentType).map((type) => (
                    <option key={type} value={type}>
                      {hrEmploymentTypeLabels[type]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Účet (volitelné propojení)">
                <SelectInput name="userId" defaultValue={employee.userId ?? ""}>
                  <option value="">—</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Fond h/týden">
                <TextInput
                  name="weeklyHours"
                  type="number"
                  min="0"
                  max="168"
                  step="any"
                  defaultValue={numberInputValue(employee.weeklyHours)}
                  required
                />
              </Field>
              <Field label="Fond h/den">
                <TextInput
                  name="dailyHours"
                  type="number"
                  min="0"
                  max="24"
                  step="any"
                  defaultValue={numberInputValue(employee.dailyHours)}
                  required
                />
              </Field>
              <Field label="Nástup (volitelné)">
                <TextInput
                  name="startDate"
                  type="date"
                  defaultValue={dateInputValue(employee.startDate)}
                />
              </Field>
              <Field label="Hrubá mzda / měsíc (Kč)">
                <TextInput
                  name="grossSalaryCzk"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={numberInputValue(employee.grossSalaryCzk)}
                />
              </Field>
              <Field label="Jak se daní">
                <SelectInput
                  name="salaryTaxMode"
                  defaultValue={employee.salaryTaxMode ?? ""}
                >
                  <option value="">—</option>
                  {Object.values(SalaryTaxMode).map((mode) => (
                    <option key={mode} value={mode}>
                      {salaryTaxModeLabels[mode]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Poznámka ke mzdě (volitelné)">
                <TextInput name="salaryNote" defaultValue={employee.salaryNote ?? ""} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Uložit změny</Button>
              <ButtonLink href="/hr/employees" variant="ghost">
                Zrušit
              </ButtonLink>
            </div>
          </form>
        </Section>
      ) : (
        <EmptyState>Úprava zaměstnance není dostupná bez databáze.</EmptyState>
      )}
    </>
  );
}
