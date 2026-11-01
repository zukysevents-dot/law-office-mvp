import Link from "next/link";

import {
  importAttendance,
  punchAttendance,
  recordAttendance,
} from "@/app/actions/hr";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { countLabel, formatDateUtc, formatHours } from "@/lib/format";
import {
  formatAttendanceTime,
  formatOfficeTime,
  officeWorkDate,
  punchStatus,
} from "@/lib/hr/attendance-calc";
import {
  attendanceFilterQuery,
  attendanceFilterWhere,
  hasAttendanceFilters,
  monthPeriod,
  readAttendanceFilters,
  weekPeriod,
  type AttendanceFilters,
} from "@/lib/hr/attendance-filters";
import { hrAttendanceSourceLabels } from "@/lib/labels";
import {
  andWhere,
  canManageHr,
  hrAttendanceVisibilityWhere,
  hrEmployeeVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { AccessDenied } from "@/components/access-denied";
import { moduleAccessDenial } from "@/lib/module-access.server";
import { filterFormKey, firstParam, type SearchParamValue } from "@/lib/search-params";

export const dynamic = "force-dynamic";

const recordInclude = {
  employee: { select: { firstName: true, lastName: true } },
} satisfies Prisma.HrAttendanceRecordInclude;

type RecordRow = Prisma.HrAttendanceRecordGetPayload<{
  include: typeof recordInclude;
}>;

// Bez filtru stránka ukazuje posledních 200 záznamů; s filtrem až 1000 (víc
// = zúžit období nebo použít export, který má celý rozsah).
const DEFAULT_LIMIT = 200;
const FILTERED_LIMIT = 1000;

type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  archivedAt: Date | null;
};

type Data = {
  records: RecordRow[];
  /** Počet a součet hodin všech záznamů odpovídajících filtru (ne jen zobrazených). */
  totals: { count: number; workedHours: number };
  /** Aktivní karty — pro zápis docházky. */
  employees: EmployeeOption[];
  /** Všechny viditelné karty vč. archivovaných — pro filtr záznamů. */
  filterEmployees: EmployeeOption[];
  officeToday: Date;
  canManage: boolean;
  // Karta přihlášeného uživatele — ruční zápis vlastní docházky (i zpětně).
  myEmployeeId: string | null;
  // Samoobslužné píchačky: stav dnešního záznamu navázaného zaměstnance.
  punch: {
    checkIn: Date | null;
    checkOut: Date | null;
    breakHours: number;
    workedHours: number;
  } | null;
};

const emptyData: Data = {
  records: [],
  totals: { count: 0, workedHours: 0 },
  employees: [],
  filterEmployees: [],
  officeToday: officeWorkDate(new Date()),
  canManage: false,
  myEmployeeId: null,
  punch: null,
};

type PageProps = {
  searchParams: Promise<Record<string, SearchParamValue>>;
};

function periodHref(filters: AttendanceFilters, period: { from: string; to: string }) {
  const query = attendanceFilterQuery({ ...filters, ...period });
  return query ? `/hr/attendance?${query}#zaznamy` : "/hr/attendance#zaznamy";
}

export default async function HrAttendancePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = readAttendanceFilters((key) => firstParam(params, key));
  const filtered = hasAttendanceFilters(filters);

  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.hr");
  if (accessDenied) {
    return <AccessDenied title="Docházka" message={accessDenied} />;
  }

  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
    const prisma = getPrisma();
    const canManage = canManageHr(currentUser);

    const recordsWhere = andWhere(
      attendanceFilterWhere(filters),
      hrAttendanceVisibilityWhere(currentUser),
    );

    const [records, aggregate, filterEmployees, myEmployee] = await Promise.all([
      prisma.hrAttendanceRecord.findMany({
        where: recordsWhere,
        orderBy: [{ workDate: "desc" }, { employee: { lastName: "asc" } }],
        include: recordInclude,
        take: filtered ? FILTERED_LIMIT : DEFAULT_LIMIT,
      }),
      prisma.hrAttendanceRecord.aggregate({
        where: recordsWhere,
        _count: { _all: true },
        _sum: { workedHours: true },
      }),
      canManage
        ? prisma.hrEmployee.findMany({
            where: hrEmployeeVisibilityWhere(currentUser),
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
            select: { id: true, firstName: true, lastName: true, archivedAt: true },
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
        select: { checkIn: true, checkOut: true, breakHours: true, workedHours: true },
      });
      punch = {
        checkIn: today?.checkIn ?? null,
        checkOut: today?.checkOut ?? null,
        breakHours: Number(today?.breakHours ?? 0),
        workedHours: Number(today?.workedHours ?? 0),
      };
    }

    return {
      records,
      totals: {
        count: aggregate._count._all,
        workedHours: Number(aggregate._sum.workedHours ?? 0),
      },
      employees: filterEmployees.filter((employee) => !employee.archivedAt),
      filterEmployees,
      officeToday: officeWorkDate(new Date()),
      canManage,
      myEmployeeId: myEmployee?.id ?? null,
      punch,
    };
  });

  const data = result.data ?? emptyData;
  const canRecord = data.canManage
    ? data.employees.length > 0
    : Boolean(data.myEmployeeId);
  const punchState = data.punch ? punchStatus(data.punch) : null;
  const filterQuery = attendanceFilterQuery(filters);
  const exportSuffix = filterQuery ? `&${filterQuery}` : "";
  const shownLimit = filtered ? FILTERED_LIMIT : DEFAULT_LIMIT;
  const periods = [
    { label: "Tento týden", ...weekPeriod(data.officeToday) },
    { label: "Tento měsíc", ...monthPeriod(data.officeToday) },
    { label: "Minulý měsíc", ...monthPeriod(data.officeToday, -1) },
  ];

  return (
    <>
      <PageHeader
        title="Docházka"
        description="Evidence odpracovaných hodin (ruční zadání, píchačky nebo import z terminálu)."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {data.punch ? (
        <Section title="Moje píchačky">
          <div className="flex flex-wrap items-center gap-3">
            <form action={punchAttendance}>
              <input type="hidden" name="direction" value="in" />
              <Button type="submit" disabled={punchState === "in"}>
                Příchod
              </Button>
            </form>
            <form action={punchAttendance}>
              <input type="hidden" name="direction" value="out" />
              <Button
                type="submit"
                variant="secondary"
                disabled={punchState !== "in"}
              >
                Odchod
              </Button>
            </form>
            <span className="text-sm text-stone-600">
              Dnes:{" "}
              {data.punch.checkIn
                ? `příchod ${formatOfficeTime(data.punch.checkIn)}`
                : "příchod nezaznamenán"}
              {data.punch.checkOut
                ? ` · odchod ${formatOfficeTime(data.punch.checkOut)}`
                : ""}
              {data.punch.breakHours > 0
                ? ` · přestávka ${formatHours(data.punch.breakHours)} h`
                : ""}
              {punchState === "out"
                ? ` · odpracováno ${formatHours(data.punch.workedHours)} h`
                : ""}
              {punchState === "in" ? " · v práci" : ""}
            </span>
          </div>
          {punchState === "out" ? (
            <p className="mt-2 text-xs text-stone-600">
              Vracíte se (např. z oběda)? Klikněte znovu na Příchod — doba mimo
              kancelář se započítá jako přestávka a odpracované hodiny se
              dopočítají při dalším odchodu.
            </p>
          ) : null}
        </Section>
      ) : null}

      {data.canManage && data.employees.length === 0 ? (
        <Section title="Zapsat docházku">
          <EmptyState>
            Kancelář zatím nemá žádné zaměstnance. Založte je v sekci{" "}
            <Link href="/hr/employees" className="font-medium underline">
              Zaměstnanci
            </Link>
            .
          </EmptyState>
        </Section>
      ) : null}

      {canRecord ? (
        <Section title="Zapsat docházku">
          <form action={recordAttendance} className="grid gap-4 sm:max-w-2xl">
            <div className="grid gap-4 sm:grid-cols-2">
              {data.canManage ? (
                <Field label="Zaměstnanec">
                  <SelectInput name="employeeId" required>
                    {data.employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.lastName} {employee.firstName}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              ) : (
                <input
                  type="hidden"
                  name="employeeId"
                  value={data.myEmployeeId ?? ""}
                />
              )}
              <Field label="Datum">
                <TextInput name="workDate" type="date" required />
              </Field>
              <Field label="Příchod (volitelné)">
                <TextInput name="checkIn" type="time" />
              </Field>
              <Field label="Odchod (volitelné)">
                <TextInput name="checkOut" type="time" />
              </Field>
              <Field label="Odpracováno (h)">
                <TextInput name="workedHours" type="number" min="0" max="24" step="any" defaultValue="8" />
              </Field>
              <Field label="Přestávka (h)">
                <TextInput
                  name="breakHours"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="24"
                  step="0.1"
                  defaultValue="0"
                />
              </Field>
            </div>
            <p className="text-xs text-stone-600">
              Docházku můžete zapsat i zpětně — vyberte den a čas příchodu
              a odchodu. Když vyplníte oba, odpracované hodiny se dopočítají
              automaticky (minus přestávka). Přestávku zadejte v hodinách
              i po desetinách (0,1 h = 6 min, 0,5 h = 30 min). Prázdné pole
              ponechá už zaznamenaný čas.
            </p>
            <Field label="Poznámka (volitelné)">
              <TextInput name="note" />
            </Field>
            <div>
              <Button type="submit" pendingLabel="Ukládám…">Uložit docházku</Button>
            </div>
          </form>
        </Section>
      ) : null}

      {data.canManage ? (
        <Section title="Import docházky (CSV)">
          <form action={importAttendance} className="grid gap-4 sm:max-w-2xl">
            <Field label="CSV export z docházkového systému">
              <TextArea
                name="csv"
                rows={8}
                placeholder={
                  "osobniCislo;datum;prichod;odchod;prestavka\n1001;2026-07-21;08:01;16:35;0,5"
                }
                required
              />
            </Field>
            <div>
              <Button type="submit" variant="secondary">
                Importovat
              </Button>
            </div>
          </form>
          <div className="mt-3 grid gap-1 text-xs leading-5 text-stone-600">
            <p>
              Terminál: <code>osobniCislo;datum;prichod;odchod;prestavka</code>
            </p>
            <p>
              Denní součet: <code>osobniCislo;datum;odpracovano;prestavka</code>
            </p>
            <p>
              České i anglické hlavičky mohou být v libovolném pořadí.
              Zaměstnanci se párují podle osobního čísla; chybný nebo neznámý
              záznam zruší celý import a událost se zapíše do auditu.
            </p>
          </div>
        </Section>
      ) : null}

      <Section title="Záznamy docházky" id="zaznamy">
        <form
          key={filterFormKey(params)}
          method="get"
          action="/hr/attendance#zaznamy"
          className="mb-3 flex flex-wrap items-end gap-3"
        >
          <Field label="Od">
            <TextInput name="from" type="date" defaultValue={filters.from} />
          </Field>
          <Field label="Do">
            <TextInput name="to" type="date" defaultValue={filters.to} />
          </Field>
          {data.canManage ? (
            <Field label="Zaměstnanec">
              <SelectInput name="employeeId" defaultValue={filters.employeeId}>
                <option value="">Všichni zaměstnanci</option>
                {data.filterEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.lastName} {employee.firstName}
                    {employee.archivedAt ? " (archivováno)" : ""}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}
          <Button type="submit" variant="secondary">
            Filtrovat
          </Button>
          {filtered ? (
            <ButtonLink href="/hr/attendance#zaznamy" variant="ghost">
              Zrušit filtry
            </ButtonLink>
          ) : null}
        </form>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-stone-600">Období:</span>
          {periods.map((period) => (
            <Link
              key={period.label}
              href={periodHref(filters, period)}
              className={
                filters.from === period.from && filters.to === period.to
                  ? "rounded-md bg-stone-900 px-2 py-1 font-medium text-white"
                  : "rounded-md border border-stone-300 px-2 py-1 text-stone-700 hover:bg-stone-100"
              }
            >
              {period.label}
            </Link>
          ))}
          <span className="ml-auto flex flex-wrap gap-2">
            <ButtonLink
              href={`/hr/attendance/export?format=xlsx${exportSuffix}`}
              variant="secondary"
            >
              Export XLSX
            </ButtonLink>
            <ButtonLink
              href={`/hr/attendance/export?format=csv${exportSuffix}`}
              variant="ghost"
            >
              Export CSV
            </ButtonLink>
          </span>
        </div>
        {data.records.length > 0 ? (
          <>
            <p className="mb-2 text-sm text-stone-600">
              {filtered ? "Odpovídá filtru" : "Celkem"}:{" "}
              {countLabel(data.totals.count, ["záznam", "záznamy", "záznamů"])}{" "}
              · odpracováno {formatHours(data.totals.workedHours)} h
              {data.totals.count > data.records.length
                ? ` · zobrazeno posledních ${shownLimit}, kompletní data v exportu`
                : ""}
            </p>
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
                      <td>
                        {record.checkIn
                          ? formatAttendanceTime(record.checkIn, record.workDate)
                          : "—"}
                      </td>
                      <td>
                        {record.checkOut
                          ? formatAttendanceTime(record.checkOut, record.workDate)
                          : "—"}
                      </td>
                      <td>{formatHours(record.workedHours)} h</td>
                      <td>{formatHours(record.breakHours)} h</td>
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
          </>
        ) : (
          <EmptyState>
            {filtered
              ? "Filtru neodpovídají žádné záznamy docházky."
              : "Zatím nejsou žádné záznamy docházky."}
          </EmptyState>
        )}
      </Section>
    </>
  );
}
