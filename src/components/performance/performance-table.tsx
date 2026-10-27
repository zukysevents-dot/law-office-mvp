import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { KpiCell } from "@/components/performance/kpi-cell";
import { RowClickNav } from "@/components/row-click-nav";
import { Badge } from "@/components/ui/badge";
import { formatHours } from "@/lib/format";
import { hrAbsenceTypeLabels, userRoleLabels, workloadLevelLabels } from "@/lib/labels";
import type {
  PerformanceRow,
  PerformanceSortKey,
  PerformanceTotals,
  SortDirection,
} from "@/lib/performance/metrics";
import { countLabel, czechPlural } from "@/lib/plural";
import { workloadLevelTone } from "@/lib/status-tones";
import { cn } from "@/lib/utils";

type Column = {
  key: PerformanceSortKey;
  label: string;
  numeric?: boolean;
  hr?: boolean;
};

const COLUMNS: Column[] = [
  { key: "name", label: "Zaměstnanec" },
  { key: "total", label: "Hodiny celkem", numeric: true },
  { key: "billable", label: "Fakturovatelné", numeric: true },
  { key: "nonBillable", label: "Nefakturovatelné", numeric: true },
  { key: "open", label: "Otevřené úkoly", numeric: true },
  { key: "overdue", label: "Po termínu", numeric: true },
  { key: "completed", label: "Dokončené", numeric: true },
  { key: "upcoming", label: "Termíny do 14 dnů", numeric: true },
  { key: "workload", label: "Vytížení", numeric: true },
  { key: "attendance", label: "Docházka", numeric: true, hr: true },
  { key: "absence", label: "Absence", numeric: true, hr: true },
];

const cellBase = "px-3 py-3 align-top text-sm";
const stickyCell =
  "sticky left-0 z-[1] bg-white shadow-[1px_0_0_0_#e6ecef] group-hover:bg-[#f6f8f9]";

// „1 den“, „2 dny“, „5 dnů“, „1,5 dne“ (půldny u absencí).
export function dayLabel(days: number) {
  const text = formatHours(days);
  if (!Number.isInteger(days)) {
    return `${text} dne`;
  }
  return `${text} ${czechPlural(days, ["den", "dny", "dnů"])}`;
}

function absenceTitle(byType: Record<string, number>) {
  const parts = Object.entries(byType).map(
    ([type, days]) =>
      `${hrAbsenceTypeLabels[type as keyof typeof hrAbsenceTypeLabels] ?? type} ${formatHours(days)}`,
  );
  return parts.length > 0 ? parts.join(", ") : "Žádná absence v období";
}

// Součet v řádku „Celkem“. Když plán nemají všichni, % plnění se počítá jen
// z lidí s plánem (jinak by ho lidé bez cíle zkreslovali) a řekne se to.
function TotalKpiCell({
  actual,
  withTarget,
  target,
  pct,
  peopleWithTarget,
  people,
}: {
  actual: number;
  withTarget: number;
  target: number | null;
  pct: number | null;
  peopleWithTarget: number;
  people: number;
}) {
  if (peopleWithTarget === people) {
    return <KpiCell actual={actual} target={target} pct={pct} />;
  }
  return (
    <div className="grid gap-1">
      <span className="font-semibold tabular-nums text-[#0e1822]">{formatHours(actual)} h</span>
      {target != null && pct != null ? (
        <span className="text-xs text-[#566673]">
          plán má {peopleWithTarget} z {people}: {formatHours(withTarget)} / {formatHours(target)} h ·{" "}
          {pct} %
        </span>
      ) : (
        <span className="text-xs text-[#566673]">plán nenastaven</span>
      )}
    </div>
  );
}

function SortHeader({
  column,
  sort,
  dir,
  hrefFor,
}: {
  column: Column;
  sort: PerformanceSortKey;
  dir: SortDirection;
  hrefFor: (key: PerformanceSortKey, dir: SortDirection) => string;
}) {
  const active = sort === column.key;
  const nextDir: SortDirection = active && dir === "asc" ? "desc" : "asc";
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#566673]",
        column.key === "name" && "sticky left-0 z-[2] bg-[#f6f8f9] shadow-[1px_0_0_0_#e6ecef]",
      )}
    >
      <Link
        href={hrefFor(column.key, nextDir)}
        className="inline-flex items-center gap-1 rounded hover:text-[#0e1822] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0e1822]"
        scroll={false}
      >
        {column.label}
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </th>
  );
}

export function PerformanceTable({
  rows,
  totals,
  sort,
  dir,
  showHr,
  hrefForSort,
  detailHref,
  overdueHref,
}: {
  rows: PerformanceRow[];
  totals: PerformanceTotals;
  sort: PerformanceSortKey;
  dir: SortDirection;
  showHr: boolean;
  hrefForSort: (key: PerformanceSortKey, dir: SortDirection) => string;
  detailHref: (userId: string) => string;
  overdueHref: (userId: string) => string;
}) {
  const columns = COLUMNS.filter((column) => showHr || !column.hr);
  return (
    <RowClickNav>
      <div className="overflow-x-auto rounded-md border border-[#e6ecef]" data-performance-table>
        <table className="w-full min-w-[64rem] border-collapse">
          <caption className="sr-only">
            Výkonnost zaměstnanců – klikněte na řádek pro detail osoby
          </caption>
          <thead className="bg-[#f6f8f9]">
            <tr>
              {columns.map((column) => (
                <SortHeader
                  key={column.key}
                  column={column}
                  sort={sort}
                  dir={dir}
                  hrefFor={hrefForSort}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef2f4]">
            {rows.map((row) => (
              <tr
                key={row.userId}
                data-href={detailHref(row.userId)}
                data-performance-row={row.name}
                tabIndex={0}
                className="group cursor-pointer outline-none hover:bg-[#f6f8f9] focus-visible:bg-[#eef7f7]"
              >
                <th scope="row" className={cn(cellBase, stickyCell, "min-w-[10rem] text-left font-normal normal-case tracking-normal")}>
                  <Link
                    href={detailHref(row.userId)}
                    className="font-medium text-[#0e1822] underline-offset-2 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="text-xs text-[#566673]">
                    {userRoleLabels[row.role as keyof typeof userRoleLabels] ?? row.role}
                    {row.teamName ? ` · ${row.teamName}` : ""}
                  </p>
                </th>
                <td className={cellBase} data-col="total">
                  <KpiCell actual={row.hours.total} target={row.totalTarget} pct={row.totalPct} />
                </td>
                <td className={cellBase} data-col="billable">
                  <KpiCell
                    actual={row.hours.billable}
                    target={row.billableTarget}
                    pct={row.billablePct}
                  />
                </td>
                <td className={cn(cellBase, "tabular-nums")} data-col="nonBillable">
                  {formatHours(row.hours.nonBillable)} h
                </td>
                <td className={cn(cellBase, "tabular-nums")} data-col="open">
                  {row.openTasks}
                </td>
                <td className={cn(cellBase, "tabular-nums")} data-col="overdue">
                  {row.overdueTasks > 0 ? (
                    <Link
                      href={overdueHref(row.userId)}
                      className="font-semibold text-red-800 underline underline-offset-2"
                      aria-label={`${row.name}: ${countLabel(row.overdueTasks, ["úkol", "úkoly", "úkolů"])} po termínu`}
                    >
                      {row.overdueTasks}
                    </Link>
                  ) : (
                    0
                  )}
                </td>
                <td className={cn(cellBase, "tabular-nums")} data-col="completed">
                  {row.completedTasks}
                </td>
                <td
                  className={cn(cellBase, "tabular-nums")}
                  data-col="upcoming"
                  title={`Úkoly ${row.upcomingTasks}, lhůty ${row.upcomingDeadlines}`}
                >
                  {row.upcomingTotal}
                </td>
                <td className={cellBase} data-col="workload">
                  <span
                    title={`Otevřené úkoly + po termínu + termíny do 14 dnů = ${row.workloadScore}`}
                  >
                    <Badge tone={workloadLevelTone(row.workload)}>
                      {workloadLevelLabels[row.workload]}
                    </Badge>
                  </span>
                </td>
                {showHr ? (
                  row.hr?.hasEmployee ? (
                    <>
                      <td className={cn(cellBase, "whitespace-nowrap tabular-nums")} data-col="attendance">
                        {dayLabel(row.hr.workedDays)} · {formatHours(row.hr.workedHours)} h
                      </td>
                      <td
                        className={cn(cellBase, "whitespace-nowrap tabular-nums")}
                        data-col="absence"
                        title={absenceTitle(row.hr.absence.byType)}
                      >
                        {dayLabel(row.hr.absence.days)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={cellBase} data-col="attendance" title="Nemá kartu zaměstnance v HR">
                        —
                      </td>
                      <td className={cellBase} data-col="absence" title="Nemá kartu zaměstnance v HR">
                        —
                      </td>
                    </>
                  )
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[#dce4e8] bg-[#f6f8f9]">
            <tr data-performance-total>
              <th scope="row" className={cn(cellBase, "sticky left-0 z-[1] bg-[#f6f8f9] text-left font-semibold normal-case tracking-normal text-[#0e1822]")}>
                Celkem
              </th>
              <td className={cellBase} data-col="total">
                <TotalKpiCell
                  actual={totals.hours.total}
                  withTarget={totals.totalWithTarget}
                  target={totals.totalTarget}
                  pct={totals.totalPct}
                  peopleWithTarget={totals.peopleWithTotalTarget}
                  people={totals.people}
                />
              </td>
              <td className={cellBase} data-col="billable">
                <TotalKpiCell
                  actual={totals.hours.billable}
                  withTarget={totals.billableWithTarget}
                  target={totals.billableTarget}
                  pct={totals.billablePct}
                  peopleWithTarget={totals.peopleWithBillableTarget}
                  people={totals.people}
                />
              </td>
              <td className={cn(cellBase, "font-semibold tabular-nums")}>
                {formatHours(totals.hours.nonBillable)} h
              </td>
              <td className={cn(cellBase, "font-semibold tabular-nums")}>{totals.openTasks}</td>
              <td className={cn(cellBase, "font-semibold tabular-nums")}>{totals.overdueTasks}</td>
              <td className={cn(cellBase, "font-semibold tabular-nums")}>{totals.completedTasks}</td>
              <td className={cn(cellBase, "font-semibold tabular-nums")}>{totals.upcomingTotal}</td>
              <td className={cellBase} />
              {showHr ? (
                <>
                  <td className={cn(cellBase, "whitespace-nowrap font-semibold tabular-nums")}>
                    {totals.hr
                      ? `${dayLabel(totals.hr.workedDays)} · ${formatHours(totals.hr.workedHours)} h`
                      : "—"}
                  </td>
                  <td className={cn(cellBase, "whitespace-nowrap font-semibold tabular-nums")}>
                    {totals.hr ? dayLabel(totals.hr.absenceDays) : "—"}
                  </td>
                </>
              ) : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </RowClickNav>
  );
}
