import { importAttendance, recordAttendance } from "@/app/actions/hr";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDateUtc } from "@/lib/format";
import { hrAttendanceSourceLabels } from "@/lib/labels";
import {
  andWhere,
  canManageHr,
  hrAttendanceVisibilityWhere,
  hrEmployeeVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const recordInclude = {
  employee: { select: { firstName: true, lastName: true } },
} satisfies Prisma.HrAttendanceRecordInclude;

type RecordRow = Prisma.HrAttendanceRecordGetPayload<{
  include: typeof recordInclude;
}>;

type Data = {
  records: RecordRow[];
  employees: Array<{ id: string; firstName: string; lastName: string }>;
  canManage: boolean;
};

const emptyData: Data = { records: [], employees: [], canManage: false };

export default async function HrAttendancePage() {
  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
    const prisma = getPrisma();
    const canManage = canManageHr(currentUser);

    const [records, employees] = await Promise.all([
      prisma.hrAttendanceRecord.findMany({
        where: hrAttendanceVisibilityWhere(currentUser),
        orderBy: { workDate: "desc" },
        include: recordInclude,
        take: 200,
      }),
      canManage
        ? prisma.hrEmployee.findMany({
            where: andWhere(
              { archivedAt: null },
              hrEmployeeVisibilityWhere(currentUser),
            ),
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
    ]);

    return { records, employees, canManage };
  });

  const data = result.data ?? emptyData;

  return (
    <>
      <PageHeader
        title="Docházka"
        description="Evidence odpracovaných hodin (ruční zadání nebo import)."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {data.canManage ? (
        <Section title="Zapsat docházku">
          <form action={recordAttendance} className="grid gap-4 sm:max-w-2xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Zaměstnanec">
                <SelectInput name="employeeId" required>
                  {data.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.lastName} {employee.firstName}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Datum">
                <TextInput name="workDate" type="date" required />
              </Field>
              <Field label="Odpracováno (h)">
                <TextInput name="workedHours" type="number" defaultValue="8" />
              </Field>
              <Field label="Přestávka (h)">
                <TextInput name="breakHours" type="number" defaultValue="0" />
              </Field>
            </div>
            <Field label="Poznámka (volitelné)">
              <TextInput name="note" />
            </Field>
            <div>
              <Button type="submit">Uložit docházku</Button>
            </div>
          </form>
        </Section>
      ) : null}

      {data.canManage ? (
        <Section title="Import docházky (CSV)">
          <form action={importAttendance} className="grid gap-4 sm:max-w-2xl">
            <Field label="CSV (osobní číslo;datum;odpracováno;přestávka)">
              <TextArea
                name="csv"
                rows={6}
                placeholder={"1001;2026-06-22;8;0,5\n1002;2026-06-22;7,5"}
                required
              />
            </Field>
            <div>
              <Button type="submit" variant="secondary">
                Importovat
              </Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-stone-400">
            Středníkem oddělené řádky; zaměstnanci se párují podle osobního čísla.
            Chybný řádek import zruší celý (nic se neuloží).
          </p>
        </Section>
      ) : null}

      <Section title="Záznamy docházky">
        {data.records.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Zaměstnanec</th>
                  <th>Odpracováno</th>
                  <th>Přestávka</th>
                  <th>Zdroj</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDateUtc(record.workDate)}</td>
                    <td className="font-medium text-stone-950">
                      {record.employee.lastName} {record.employee.firstName}
                    </td>
                    <td>{Number(record.workedHours)} h</td>
                    <td>{Number(record.breakHours)} h</td>
                    <td>
                      <Badge tone={record.source === "IMPORT" ? "blue" : "neutral"}>
                        {hrAttendanceSourceLabels[record.source]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Zatím nejsou žádné záznamy docházky.</EmptyState>
        )}
      </Section>
    </>
  );
}
