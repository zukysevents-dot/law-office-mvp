import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { PerformanceFilterForm } from "@/components/performance/performance-filter-form";
import { PerformanceTable } from "@/components/performance/performance-table";
import { PeriodNav } from "@/components/performance/period-nav";
import { Section } from "@/components/section";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { officeWorkDate } from "@/lib/hr/attendance-calc";
import { moduleAccessDenial } from "@/lib/module-access.server";
import {
  performanceFilterParams,
  readPerformanceFilters,
  toQuery,
} from "@/lib/performance/filters";
import {
  loadPerformanceOverview,
  type PerformanceOverview,
} from "@/lib/performance/load.server";
import { performanceTotals } from "@/lib/performance/metrics";
import { resolvePerformancePeriod } from "@/lib/performance/period";
import { filterFormKey, firstParam } from "@/lib/search-params";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PerformancePage({ searchParams }: PageProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.performance");
  if (accessDenied) {
    return <AccessDenied title="Výkonnost" message={accessDenied} />;
  }

  const params = await searchParams;
  const filters = readPerformanceFilters((key) => firstParam(params, key));
  const now = new Date();
  const fallbackPeriod = resolvePerformancePeriod(filters.period, officeWorkDate(now));
  const fallback: PerformanceOverview = {
    period: fallbackPeriod,
    rows: [],
    totals: performanceTotals([]),
    memberCount: 0,
    teams: [],
    roles: [],
    people: [],
    showHr: false,
    showDeadlines: false,
    hrNotice: false,
    scopeNotice: null,
    canManageUsers: false,
  };
  const result = await safeQuery(fallback, () =>
    loadPerformanceOverview(accessUser, filters, now),
  );
  const data = result.data;
  const { period } = data;

  const filterParams = performanceFilterParams(filters, { includeSort: false });
  const sortParams = performanceFilterParams(filters);
  const pageQuery = toQuery(period.params, sortParams);
  const exportHref = `/performance/export${toQuery(period.params, sortParams)}`;

  return (
    <>
      <PageHeader
        title="Výkonnost"
        description="Plnění KPI hodin, úkoly, docházka a vytížení zaměstnanců kanceláře."
        action={
          // Obyčejný odkaz (ne next/link): prefetch by route handler spustil
          // a zapsal do auditu export, který nikdo nestáhl.
          <a
            href={exportHref}
            download
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#17A2A2] bg-[#17A2A2] px-4 text-sm font-medium text-[#0e1822] transition hover:bg-[#2dc6c2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e1822]"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Export XLSX
          </a>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <Section title="Filtry">
        <PerformanceFilterForm
          formKey={filterFormKey(params)}
          period={period}
          filters={filters}
          teams={data.teams}
          roles={data.roles}
          people={data.people}
        />
        {period.error ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            {period.error}
          </p>
        ) : null}
      </Section>
      {data.scopeNotice ? (
        <div
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          Hodiny a úkoly zahrnují jen záznamy ve vašem rozsahu dat ({data.scopeNotice}).
          Pro přehled celé kanceláře požádejte administrátora o rozsah „Vše v kanceláři“.
        </div>
      ) : null}
      {data.hrNotice ? (
        <div
          role="note"
          className="rounded-lg border border-[#dce4e8] bg-[#f6f8f9] px-4 py-3 text-sm text-[#2c3a45]"
        >
          Docházku a absence vidí jen uživatelé s oprávněním „Spravuje HR a docházku“.
        </div>
      ) : null}
      <Section title="Zaměstnanci">
        {/* minmax(0,1fr): tabulka se posouvá uvnitř, stránka do šířky ne. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <PeriodNav
            label={period.label}
            prevHref={`/performance${toQuery(period.prevParams, sortParams)}`}
            nextHref={`/performance${toQuery(period.nextParams, sortParams)}`}
          />
          {data.rows.length > 0 ? (
            <PerformanceTable
              rows={data.rows}
              totals={data.totals}
              sort={filters.sort}
              dir={filters.dir}
              showHr={data.showHr}
              hrefForSort={(sort, dir) =>
                `/performance${toQuery(period.params, filterParams, sort === "name" && dir === "asc" ? {} : { sort, dir })}`
              }
              detailHref={(userId) => `/performance/${userId}${pageQuery}`}
              overdueHref={(userId) => `/tasks${toQuery({ assignedToId: userId, overdue: "1" })}`}
            />
          ) : (
            <EmptyState>Filtrům neodpovídá žádný zaměstnanec.</EmptyState>
          )}
          <p className="text-xs leading-5 text-[#566673]">
            Cíle se počítají z aktuálního plánu hodin (Nastavení → Plán hodin
            pracovníků) poměrem podle pracovních dnů (Po–Pá, bez svátků).
            Fakturovatelné = výkazy označené jako fakturovatelné včetně
            čekajících na schválení. Vytížení = otevřené úkoly + po termínu +
            termíny do 14 dnů{data.showDeadlines ? " (úkoly i lhůty)" : ""}; střední
            od 8, vysoké od 16.
            {data.canManageUsers ? (
              <>
                {" "}
                <Link
                  href="/settings#plan-hodin"
                  className="font-medium text-[#0e1822] underline underline-offset-2"
                >
                  Upravit plán hodin
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </Section>
    </>
  );
}
