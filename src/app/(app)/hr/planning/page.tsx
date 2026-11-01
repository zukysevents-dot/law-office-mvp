import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { savePresencePlan } from "@/app/actions/hr-presence";
import { AccessDenied } from "@/components/access-denied";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { HrPresenceStatus, ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { DAY_MS, WEEKDAY_LABELS } from "@/lib/hours-plan";
import { officeWorkDate } from "@/lib/hr/attendance-calc";
import {
  PRESENCE_NOTE_MAX,
  buildPresenceRows,
  parseWeekStart,
  presenceKindLabels,
  summarizePresenceDay,
  toDateKey,
  weekWorkdays,
  type PresenceCell,
  type PresenceRow,
} from "@/lib/hr/presence";
import { hrAbsenceTypeLabels, hrPresenceStatusLabels } from "@/lib/labels";
import { moduleAccessDenial } from "@/lib/module-access.server";
import {
  andWhere,
  canEditHrPresencePlan,
  canManageHr,
  hrPresencePlanVisibilityWhere,
  hrTeamAbsenceCalendarWhere,
  hrTeamDirectoryWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { presenceKindTone } from "@/lib/status-tones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Data = {
  rows: PresenceRow[];
  // Zaměstnanec, jehož plán se upravuje (vlastní, správce HR i kolegův).
  editableEmployeeId: string | null;
  myEmployeeId: string | null;
  canManage: boolean;
};

const emptyData: Data = {
  rows: [],
  editableEmployeeId: null,
  myEmployeeId: null,
  canManage: false,
};

const dayFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  timeZone: "UTC",
});

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function dayLabel(day: Date) {
  return `${WEEKDAY_LABELS[(day.getUTCDay() + 6) % 7]} ${dayFormatter.format(day)}`;
}

export default async function HrPlanningPage({ searchParams }: PageProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.hr");
  if (accessDenied) {
    return <AccessDenied title="Plánování přítomnosti" message={accessDenied} />;
  }

  const params = await searchParams;
  const now = new Date();
  const weekStartMs = parseWeekStart(firstParam(params.week), now);
  const weekStart = new Date(weekStartMs);
  const weekEnd = new Date(weekStartMs + 7 * DAY_MS);
  const days = weekWorkdays(weekStartMs);
  const requestedEmployeeId = firstParam(params.employee) ?? null;
  const saved = firstParam(params.saved) === "1";

  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
    const prisma = getPrisma();
    const canManage = canManageHr(currentUser);

    const [employees, plans, absences] = await Promise.all([
      prisma.hrEmployee.findMany({
        where: hrTeamDirectoryWhere(currentUser),
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true, userId: true },
      }),
      prisma.hrPresencePlan.findMany({
        where: andWhere(
          { date: { gte: weekStart, lt: weekEnd } },
          hrPresencePlanVisibilityWhere(currentUser),
        ),
        select: { employeeId: true, date: true, status: true, note: true },
      }),
      prisma.hrAbsenceRequest.findMany({
        where: andWhere(
          { startDate: { lt: weekEnd }, endDate: { gte: weekStart } },
          hrTeamAbsenceCalendarWhere(currentUser),
        ),
        select: {
          employeeId: true,
          type: true,
          status: true,
          startDate: true,
          endDate: true,
          halfDay: true,
        },
      }),
    ]);

    const myEmployee = employees.find((employee) => employee.userId === currentUser.id);
    const requested = requestedEmployeeId
      ? employees.find((employee) => employee.id === requestedEmployeeId)
      : null;
    const editable =
      requested && canEditHrPresencePlan(currentUser, requested) ? requested : myEmployee;

    // Vlastní řádek nahoře, pak kolegové podle příjmení. Typy absencí kolegů
    // se maskují v buildPresenceRows (na klienta nejde nic citlivého).
    const ordered = myEmployee
      ? [myEmployee, ...employees.filter((employee) => employee.id !== myEmployee.id)]
      : employees;

    return {
      rows: buildPresenceRows({
        employees: ordered,
        days,
        plans,
        absences,
        viewerUserId: currentUser.id,
        viewerIsHrManager: canManage,
        typeLabels: hrAbsenceTypeLabels,
      }),
      editableEmployeeId: editable?.id ?? null,
      myEmployeeId: myEmployee?.id ?? null,
      canManage,
    };
  });

  const data = result.data ?? emptyData;
  const weekKey = toDateKey(weekStart);
  const todayKey = toDateKey(officeWorkDate(now));
  const editableRow = data.rows.find((row) => row.employee.id === data.editableEmployeeId);
  const editingOther = Boolean(editableRow && editableRow.employee.id !== data.myEmployeeId);
  const weekHref = (offsetWeeks: number) => {
    const search = new URLSearchParams({
      week: toDateKey(new Date(weekStartMs + offsetWeeks * 7 * DAY_MS)),
    });
    if (editingOther && editableRow) {
      search.set("employee", editableRow.employee.id);
    }
    return `/hr/planning?${search.toString()}`;
  };
  const rangeLabel = `${dayFormatter.format(days[0])} – ${dayFormatter.format(days[days.length - 1])} ${days[0].getUTCFullYear()}`;

  return (
    <>
      <PageHeader
        title="Plánování přítomnosti"
        description="Kdy budete v kanceláři, na home office nebo mimo kancelář. Schválené absence se do plánu propisují samy."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <nav
        aria-label="Výběr týdne"
        className="flex flex-wrap items-center gap-2"
        data-testid="presence-week-nav"
      >
        <ButtonLink href={weekHref(-1)} variant="ghost" className="h-9 px-3">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Předchozí týden
        </ButtonLink>
        <ButtonLink href="/hr/planning" variant="ghost" className="h-9 px-3">
          Tento týden
        </ButtonLink>
        <ButtonLink href={weekHref(1)} variant="ghost" className="h-9 px-3">
          Další týden
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </ButtonLink>
        <span className="text-sm font-medium text-[#0e1822]">{rangeLabel}</span>
      </nav>

      {editableRow ? (
        <Section
          title={
            editingOther
              ? `Plán: ${editableRow.employee.firstName} ${editableRow.employee.lastName}`
              : "Můj plán"
          }
        >
          {saved ? (
            <p
              role="status"
              className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            >
              Plán byl uložen.
            </p>
          ) : null}
          <form action={savePresencePlan} className="grid gap-3" data-testid="presence-plan-form">
            <input type="hidden" name="employeeId" value={editableRow.employee.id} />
            <input type="hidden" name="week" value={weekKey} />
            <div className="grid gap-2">
              {editableRow.cells.map((cell, index) => (
                <PlanDayRow key={cell.date} cell={cell} day={days[index]} />
              ))}
            </div>
            <p className="text-xs text-[#566673]">
              Dovolenou, nemoc, lékaře a další nepřítomnost zadávejte jako{" "}
              <Link href="/hr/absences" className="font-medium underline">
                žádost o absenci
              </Link>{" "}
              – v plánu i v týmovém přehledu se ukáže sama. Poznámku k dni vidí i kolegové.
            </p>
            <div>
              <Button type="submit" pendingLabel="Ukládám…">
                Uložit plán týdne
              </Button>
            </div>
          </form>
        </Section>
      ) : result.databaseReady ? (
        <Section title="Můj plán">
          <EmptyState>
            Nemáte kartu zaměstnance, takže si zatím nemůžete plánovat přítomnost.
            Požádejte správce HR o její založení.
          </EmptyState>
        </Section>
      ) : null}

      <Section title="Týmový přehled">
        {data.rows.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full" data-testid="presence-team-table">
              <thead>
                <tr>
                  <th>Zaměstnanec</th>
                  {days.map((day) => (
                    <th
                      key={day.toISOString()}
                      className={cn(toDateKey(day) === todayKey && "text-[#17A2A2]")}
                    >
                      {dayLabel(day)}
                      {toDateKey(day) === todayKey ? " (dnes)" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.employee.id}
                    className={cn(row.employee.id === data.myEmployeeId && "bg-[#F4F7F8]")}
                  >
                    <td className="font-medium text-stone-950">
                      {data.canManage && row.employee.id !== data.myEmployeeId ? (
                        <Link
                          href={`/hr/planning?week=${weekKey}&employee=${row.employee.id}`}
                          className="hover:underline"
                          title="Upravit plán zaměstnance"
                        >
                          {row.employee.lastName} {row.employee.firstName}
                        </Link>
                      ) : (
                        <>
                          {row.employee.lastName} {row.employee.firstName}
                        </>
                      )}
                      {row.employee.id === data.myEmployeeId ? (
                        <span className="ml-1 text-xs font-normal text-[#566673]">(já)</span>
                      ) : null}
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.date} className="align-top">
                        <PresenceBadge cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="text-left text-xs font-medium text-[#566673]">
                    V kanceláři
                  </th>
                  {days.map((day, index) => (
                    <td key={day.toISOString()} className="text-xs text-[#566673]">
                      {summarizePresenceDay(data.rows, index).OFFICE} z {data.rows.length}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState>V kanceláři zatím nejsou žádné karty zaměstnanců.</EmptyState>
        )}
      </Section>
    </>
  );
}

function PresenceBadge({ cell }: { cell: PresenceCell }) {
  if (cell.kind === "NONE") {
    return <span className="text-xs text-[#566673]">—</span>;
  }
  return (
    <div className="grid max-w-[12rem] gap-1">
      <span>
        <Badge tone={presenceKindTone(cell.kind)}>
          {cell.label}
          {cell.halfDay ? " (½)" : ""}
        </Badge>
      </span>
      {cell.pending ? (
        <span className="text-xs text-amber-900">čeká na schválení</span>
      ) : null}
      {cell.note ? (
        <span className="break-words text-xs text-[#566673]">{cell.note}</span>
      ) : null}
    </div>
  );
}

function PlanDayRow({ cell, day }: { cell: PresenceCell; day: Date }) {
  const fromAbsence = cell.source === "absence";
  return (
    <div
      className="grid gap-2 rounded-md border border-[#dce4e8] p-3 sm:grid-cols-[8rem_14rem_1fr] sm:items-end"
      data-testid="presence-plan-day"
      data-date={cell.date}
    >
      <span className="text-sm font-medium text-[#0e1822] sm:pb-2">{dayLabel(day)}</span>
      {fromAbsence ? (
        <div className="grid gap-1 sm:col-span-2 sm:pb-2">
          <span>
            <Badge tone={presenceKindTone(cell.kind)}>
              {cell.label}
              {cell.halfDay ? " (½)" : ""}
            </Badge>
          </span>
          <span className="text-xs text-[#566673]">
            Z žádosti o absenci{cell.pending ? " (čeká na schválení)" : ""} – v plánu se
            nezadává.
          </span>
        </div>
      ) : (
        <>
          <Field label="Kde budu">
            <SelectInput
              name={`status_${cell.date}`}
              defaultValue={cell.source === "plan" ? cell.kind : ""}
              aria-label={`Kde budu – ${dayLabel(day)}`}
            >
              <option value="">{presenceKindLabels.NONE}</option>
              {Object.values(HrPresenceStatus).map((status) => (
                <option key={status} value={status}>
                  {hrPresenceStatusLabels[status]}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Poznámka (volitelné)">
            <TextInput
              name={`note_${cell.date}`}
              defaultValue={cell.note ?? ""}
              maxLength={PRESENCE_NOTE_MAX}
              placeholder="Např. dopoledne soud v Brně"
            />
          </Field>
        </>
      )}
    </div>
  );
}
