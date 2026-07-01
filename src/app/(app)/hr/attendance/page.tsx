import {
  importAttendance,
  punchAttendance,
  recordAttendance,
} from "@/app/actions/hr";
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
import { formatDateTime, formatDateUtc } from "@/lib/format";
import { officeWorkDate } from "@/lib/hr/attendance-calc";
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
  // Samoobslužné píchačky: stav dnešního záznamu navázaného zaměstnance.
  punch: { checkIn: Date | null; checkOut: Date | null } | null;
};

const emptyData: Data = {
  records: [],
  employees: [],
  canManage: false,
  punch: null,
};

export default async function HrAttendancePage() {
  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
    const prisma = getPrisma();
    const canManage = canManageHr(currentUser);

    const [records, employees, myEmployee] = await Promise.all([
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
      // Karta zaměstnance přihlášeného uživatele — pro píchačky (self-service).
      prisma.hrEmployee.findFirst({
        where: {
          userId: currentUser.id,
          organizationId: currentUser.organizationId ?? undefined,
          archivedAt: null,
        },
        select: { id: true },
      }),
    ]);

    let punch: Data["punch"] = null;
    if (myEmployee) {
      const workDate = officeWorkDate(new Date());
      const today = await prisma.hrAttendanceRecord.findUnique({
        where: {
          employeeId_workDate: { employeeId: myEmployee.id, workDate },
        },
        select: { checkIn: true, checkOut: true },
      });
      punch = { checkIn: today?.checkIn ?? null, checkOut: today?.checkOut ?? null };
    }

    return { records, employees, canManage, punch };
  });

  const data = result.data ?? emptyData;

  return (
    <>
      <PageHeader
        title="Docházka"
        description="Evidence odpracovaných hodin (ruční zadání nebo import)."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {data.punch ? (
        <Section title="Moje píchačky">
          <div className="flex flex-wrap items-center gap-3">
            <form action={punchAttendance}>
              <input type="hidden" name="direction" value="in" />
              <Button type="submit" disabled={Boolean(data.punch.checkIn)}>
                Příchod
              </Button>
            </form>
            <form action={punchAttendance}>
              <input type="hidden" name="direction" value="out" />
              <Button
                type="submit"
                variant="secondary"
                disabled={
                  !data.punch.checkIn || Boolean(data.punch.checkOut)
                }
              >
                Odchod
              </Button>
            </form>
            <span className="text-sm text-stone-600">
              Dnes:{" "}
              {data.punch.checkIn
                ? `příchod ${formatDateTime(data.punch.checkIn)}`
                : "příchod nezaznamenán"}
              {data.punch.checkOut
                ? ` · odchod ${formatDateTime(data.punch.checkOut)}`
                : ""}
            </span>
          </div>
        </Section>
      ) : null}

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
              <Field label="Příchod (volitelné)">
                <TextInput name="checkIn" type="datetime-local" />
              </Field>
              <Field label="Odchod (volitelné)">
                <TextInput name="checkOut" type="datetime-local" />
              </Field>
              <Field label="Odpracováno (h)">
                <TextInput name="workedHours" type="number" defaultValue="8" />
              </Field>
              <Field label="Přestávka (h)">
                <TextInput name="breakHours" type="number" defaultValue="0" />
              </Field>
            </div>
            <p className="text-xs text-stone-400">
              Když vyplníte příchod i odchod, odpracované hodiny se dopočítají
              automaticky (minus přestávka).
            </p>
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
                  <th>Příchod</th>
                  <th>Odchod</th>
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
                    <td>{record.checkIn ? formatDateTime(record.checkIn) : "—"}</td>
                    <td>{record.checkOut ? formatDateTime(record.checkOut) : "—"}</td>
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
