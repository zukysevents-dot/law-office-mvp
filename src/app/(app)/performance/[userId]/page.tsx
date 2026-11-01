import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { HoursKpiChart } from "@/components/hours-kpi-chart";
import { PageHeader } from "@/components/page-header";
import { KpiCell } from "@/components/performance/kpi-cell";
import { dayLabel } from "@/components/performance/performance-table";
import { PeriodFields } from "@/components/performance/period-fields";
import { PeriodNav } from "@/components/performance/period-nav";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatCaseLabel, formatDateUtc, formatHours } from "@/lib/format";
import {
  hrAbsenceTypeLabels,
  taskStatusLabels,
  userRoleLabels,
  workloadLevelLabels,
} from "@/lib/labels";
import { moduleAccessDenial } from "@/lib/module-access.server";
import {
  performanceFilterParams,
  readPerformanceFilters,
  toQuery,
} from "@/lib/performance/filters";
import {
  loadPersonPerformance,
  PERSON_TASK_LIMIT,
  type PersonPerformance,
} from "@/lib/performance/load.server";
import { DAY_MS } from "@/lib/hours-plan";
import { filterFormKey, firstParam } from "@/lib/search-params";
import { isTaskOverdue, taskStatusTone, workloadLevelTone } from "@/lib/status-tones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function Card({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="rounded-lg border border-[#dce4e8] bg-white p-4 shadow-sm shadow-[#0e1822]/5"
      data-kpi-card={testId}
    >
      <p className="text-sm font-medium text-[#566673]">{label}</p>
      <div className="mt-2 text-lg">{children}</div>
    </div>
  );
}

function Value({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <p className={cn("text-2xl font-semibold tabular-nums", danger ? "text-red-800" : "text-[#0e1822]")}>
      {children}
    </p>
  );
}

export default async function PersonPerformancePage({ params, searchParams }: PageProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.performance");
  if (accessDenied) {
    return <AccessDenied title="Výkonnost" message={accessDenied} />;
  }

  const { userId } = await params;
  const query = await searchParams;
  const filters = readPerformanceFilters((key) => firstParam(query, key));
  const result = await safeQuery<PersonPerformance | null>(null, () =>
    loadPersonPerformance(accessUser, userId, filters, new Date()),
  );

  if (result.databaseReady && !result.data) {
    notFound();
  }
  const data = result.data;
  if (!data) {
    return (
      <>
        <PageHeader title="Výkonnost" />
        <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      </>
    );
  }

  const { period, row } = data;
  const listParams = performanceFilterParams(filters);
  const backHref = `/performance${toQuery(period.params, listParams)}`;
  const selfHref = (periodParams: Record<string, string>) =>
    `/performance/${row.userId}${toQuery(periodParams, listParams)}`;
  const roleLabel = userRoleLabels[row.role as keyof typeof userRoleLabels] ?? row.role;
  const workLogsHref = `/work-logs${toQuery({
    userId: row.userId,
    dateFrom: period.fromIso,
    dateTo: period.toIso,
  })}`;
  const summaryLabel = period.kind === "week" ? "Týden" : period.kind === "month" ? "Měsíc" : "Období";

  return (
    <>
      <PageHeader
        title={`Výkonnost: ${row.name}`}
        description={[roleLabel, row.teamName].filter(Boolean).join(" · ")}
        action={
          <ButtonLink href={backHref} variant="ghost">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Zpět na Výkonnost
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      {data.scopeNotice ? (
        <div
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          Hodiny a úkoly zahrnují jen záznamy ve vašem rozsahu dat ({data.scopeNotice}).
        </div>
      ) : null}
      <Section title="Období">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <form
            key={filterFormKey(query)}
            action={`/performance/${row.userId}`}
            className="grid items-end gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
          >
            {Object.entries(listParams).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <PeriodFields
          kind={period.kind}
          from={period.fromIso}
          to={period.toIso}
          anchor={period.params.anchor}
        />
            <Button type="submit" variant="secondary">
              Použít
            </Button>
          </form>
          {period.error ? (
            <p
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            >
              {period.error}
            </p>
          ) : null}
          <PeriodNav
            label={period.label}
            prevHref={selfHref(period.prevParams)}
            nextHref={selfHref(period.nextParams)}
          />
        </div>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Hodiny celkem" testId="total">
          <KpiCell actual={row.hours.total} target={row.totalTarget} pct={row.totalPct} />
        </Card>
        <Card label="Fakturovatelné" testId="billable">
          <KpiCell
            actual={row.hours.billable}
            target={row.billableTarget}
            pct={row.billablePct}
            hint={`z toho schváleno ${formatHours(row.hours.approvedBillable)} h`}
          />
        </Card>
        <Card label="Nefakturovatelné" testId="nonBillable">
          <Value>{formatHours(row.hours.nonBillable)} h</Value>
        </Card>
        <Card label="Vytížení" testId="workload">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={workloadLevelTone(row.workload)}>{workloadLevelLabels[row.workload]}</Badge>
            <span className="text-xs text-[#566673]">skóre {row.workloadScore}</span>
          </div>
        </Card>
        <Card label="Otevřené úkoly" testId="open">
          <Value>{row.openTasks}</Value>
        </Card>
        <Card label="Po termínu" testId="overdue">
          <Value danger={row.overdueTasks > 0}>{row.overdueTasks}</Value>
        </Card>
        <Card label="Dokončené v období" testId="completed">
          <Value>{row.completedTasks}</Value>
        </Card>
        <Card label="Termíny do 14 dnů" testId="upcoming">
          <Value>{row.upcomingTotal}</Value>
          <p className="text-xs text-[#566673]">
            úkoly {row.upcomingTasks}
            {data.showDeadlines ? ` · lhůty ${row.upcomingDeadlines}` : ""}
          </p>
        </Card>
        {row.hr ? (
          <>
            <Card label="Docházka" testId="attendance">
              {row.hr.hasEmployee ? (
                <Value>
                  {dayLabel(row.hr.workedDays)} · {formatHours(row.hr.workedHours)} h
                </Value>
              ) : (
                <p className="text-sm text-[#566673]">Nemá kartu zaměstnance v HR.</p>
              )}
            </Card>
            <Card label="Absence" testId="absence">
              {row.hr.hasEmployee ? (
                <Value>{dayLabel(row.hr.absence.days)}</Value>
              ) : (
                <p className="text-sm text-[#566673]">—</p>
              )}
            </Card>
          </>
        ) : null}
      </div>
      {data.hrNotice ? (
        <p className="text-sm text-[#566673]">
          Docházku a absence vidí jen uživatelé s oprávněním „Spravuje HR a docházku“.
        </p>
      ) : null}

      <Section title={data.bucketsByDay ? "Hodiny po dnech" : "Hodiny po týdnech"} data-widget="person-hours">
        <HoursKpiChart
          caption={`Vykázané hodiny – ${period.label}`}
          buckets={data.buckets}
          summary={{
            label: summaryLabel,
            total: row.hours.total,
            billable: row.hours.billable,
            totalTarget: data.periodTargets.total,
            billableTarget: data.periodTargets.billable,
          }}
          emptyHint={<p>V tomto období nejsou vykázané žádné hodiny.</p>}
          planHint={<p>Plán hodin není nastaven.</p>}
        />
      </Section>

      <Section title="Otevřené úkoly">
        <div className="mb-3 flex flex-wrap gap-2">
          <ButtonLink href={`/tasks${toQuery({ assignedToId: row.userId })}`} variant="ghost">
            Všechny úkoly osoby
          </ButtonLink>
          <ButtonLink href={workLogsHref} variant="ghost">
            Výkazy za období
          </ButtonLink>
        </div>
        {data.openTasks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[#566673]">
                <tr>
                  <th scope="col" className="px-3 py-2">Název</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Termín</th>
                  <th scope="col" className="px-3 py-2">Projekt / případ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef2f4]">
                {data.openTasks.map((task) => {
                  const overdue = isTaskOverdue(task.deadline, task.status);
                  return (
                    <tr key={task.id}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="font-medium text-[#0e1822] underline-offset-2 hover:underline"
                        >
                          {task.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={taskStatusTone(task.status)}>{taskStatusLabels[task.status]}</Badge>
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-2 tabular-nums",
                          overdue && "font-semibold text-red-800",
                        )}
                      >
                        {task.deadline ? formatDateUtc(task.deadline) : "—"}
                        {overdue ? " · po termínu" : ""}
                      </td>
                      <td className="px-3 py-2 text-[#566673]">
                        {task.case
                          ? formatCaseLabel(task.case)
                          : (task.project?.name ?? "—")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {row.openTasks > data.openTasks.length ? (
              <p className="mt-2 text-xs text-[#566673]">
                Zobrazeno prvních {PERSON_TASK_LIMIT} úkolů podle termínu.
              </p>
            ) : null}
          </div>
        ) : (
          <EmptyState>Žádné otevřené úkoly.</EmptyState>
        )}
      </Section>

      {data.showHr && row.hr?.hasEmployee ? (
        <Section title="Absence v období">
          {data.absences.length > 0 ? (
            <ul className="divide-y divide-[#eef2f4] text-sm">
              {data.absences.map((absence) => (
                <li key={absence.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-medium text-[#0e1822]">
                    {hrAbsenceTypeLabels[absence.type as keyof typeof hrAbsenceTypeLabels] ??
                      absence.type}
                    {absence.halfDay ? " (půlden)" : ""}
                  </span>
                  <span className="tabular-nums text-[#566673]">
                    {formatDateUtc(absence.startDate)}
                    {absence.endDate.getTime() - absence.startDate.getTime() >= DAY_MS
                      ? ` – ${formatDateUtc(absence.endDate)}`
                      : ""}
                    {" · schváleno"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>V tomto období nemá schválenou absenci.</EmptyState>
          )}
        </Section>
      ) : null}
    </>
  );
}
