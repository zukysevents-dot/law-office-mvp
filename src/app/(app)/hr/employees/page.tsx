import {
  archiveEmployee,
  createEmployee,
  setLeaveBalance,
} from "@/app/actions/hr";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { HrEmploymentType, ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { computeRemainingHours } from "@/lib/hr/leave-balance";
import { hrEmploymentTypeLabels } from "@/lib/labels";
import {
  andWhere,
  canManageHr,
  hrEmployeeVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { LIST_QUERY_LIMIT } from "@/lib/query-limits";

export const dynamic = "force-dynamic";

function currentYear(): number {
  return new Date().getUTCFullYear();
}

const employeeInclude = {
  user: { select: { name: true } },
  leaveBalances: true,
} satisfies Prisma.HrEmployeeInclude;

type EmployeeRow = Prisma.HrEmployeeGetPayload<{
  include: typeof employeeInclude;
}>;

type Data = {
  employees: EmployeeRow[];
  members: Array<{ id: string; name: string }>;
  canManage: boolean;
  year: number;
};

const emptyData: Data = {
  employees: [],
  members: [],
  canManage: false,
  year: 0,
};

export default async function HrEmployeesPage() {
  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
    const prisma = getPrisma();
    const canManage = canManageHr(currentUser);

    const [employees, memberRows] = await Promise.all([
      prisma.hrEmployee.findMany({
        where: andWhere(
          { archivedAt: null },
          hrEmployeeVisibilityWhere(currentUser),
        ),
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: employeeInclude,
        take: 500,
      }),
      canManage
        ? prisma.organizationMember.findMany({
            where: {
              organizationId: currentUser.organizationId ?? undefined,
              status: "ACTIVE",
            },
            orderBy: { user: { name: "asc" } },
            select: { user: { select: { id: true, name: true } } },
            take: LIST_QUERY_LIMIT,
          })
        : Promise.resolve([]),
    ]);

    return {
      employees,
      members: memberRows.map((row) => row.user),
      canManage,
      year: currentYear(),
    };
  });

  const data = result.data ?? emptyData;

  return (
    <>
      <PageHeader
        title="Zaměstnanci"
        description="Evidence zaměstnanců, úvazek a roční nárok dovolené."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <Section title="Seznam zaměstnanců">
        {data.employees.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Jméno</th>
                  <th>Pozice</th>
                  <th>Úvazek</th>
                  <th>Účet</th>
                  <th>Dovolená {data.year} (zbývá h)</th>
                  {data.canManage ? <th>Akce</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.employees.map((employee) => {
                  const balance = employee.leaveBalances.find(
                    (b) => b.year === data.year,
                  );
                  const remaining = balance
                    ? computeRemainingHours(
                        Number(balance.entitlementHours),
                        Number(balance.carryoverHours),
                        Number(balance.usedHours),
                      )
                    : null;
                  return (
                    <tr key={employee.id}>
                      <td className="font-medium text-stone-950">
                        {employee.lastName} {employee.firstName}
                        {!employee.active ? (
                          <Badge tone="neutral">neaktivní</Badge>
                        ) : null}
                      </td>
                      <td>{employee.position ?? "—"}</td>
                      <td>
                        {hrEmploymentTypeLabels[employee.employmentType]} ·{" "}
                        {Number(employee.weeklyHours)} h/týden
                      </td>
                      <td>{employee.user?.name ?? "—"}</td>
                      <td>{remaining ?? "—"}</td>
                      {data.canManage ? (
                        <td>
                          <form action={archiveEmployee}>
                            <input
                              type="hidden"
                              name="employeeId"
                              value={employee.id}
                            />
                            <Button type="submit" variant="ghost">
                              Archivovat
                            </Button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Zatím nejsou evidováni žádní zaměstnanci.</EmptyState>
        )}
      </Section>

      {data.canManage ? (
        <>
          <Section title="Nový zaměstnanec">
            <form action={createEmployee} className="grid gap-4 sm:max-w-2xl">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Jméno">
                  <TextInput name="firstName" required />
                </Field>
                <Field label="Příjmení">
                  <TextInput name="lastName" required />
                </Field>
                <Field label="Osobní číslo (pro mzdy/import)">
                  <TextInput name="personalNumber" />
                </Field>
                <Field label="Pozice">
                  <TextInput name="position" />
                </Field>
                <Field label="Typ úvazku">
                  <SelectInput
                    name="employmentType"
                    defaultValue={HrEmploymentType.FULL_TIME}
                  >
                    {Object.values(HrEmploymentType).map((type) => (
                      <option key={type} value={type}>
                        {hrEmploymentTypeLabels[type]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Účet (volitelné propojení)">
                  <SelectInput name="userId" defaultValue="">
                    <option value="">—</option>
                    {data.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Fond h/týden">
                  <TextInput name="weeklyHours" type="number" defaultValue="40" required />
                </Field>
                <Field label="Fond h/den">
                  <TextInput name="dailyHours" type="number" defaultValue="8" required />
                </Field>
                <Field label="Nástup (volitelné)">
                  <TextInput name="startDate" type="date" />
                </Field>
              </div>
              <div>
                <Button type="submit">Přidat zaměstnance</Button>
              </div>
            </form>
          </Section>

          <Section title="Nastavit roční nárok dovolené">
            <form action={setLeaveBalance} className="flex flex-wrap items-end gap-3">
              <Field label="Zaměstnanec">
                <SelectInput name="employeeId" required>
                  {data.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.lastName} {employee.firstName}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Rok">
                <TextInput name="year" type="number" defaultValue={data.year} required />
              </Field>
              <Field label="Nárok (h)">
                <TextInput name="entitlementHours" type="number" defaultValue="160" required />
              </Field>
              <Field label="Převod (h)">
                <TextInput name="carryoverHours" type="number" defaultValue="0" />
              </Field>
              <Button type="submit" variant="secondary">
                Uložit nárok
              </Button>
            </form>
          </Section>
        </>
      ) : null}
    </>
  );
}
