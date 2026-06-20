import { PageHeader } from "@/components/page-header";
import { ReportFilterForm } from "@/components/report-filter-form";
import { Section } from "@/components/section";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatHours, formatMoney } from "@/lib/format";
import { andWhere, canViewBillabilityKpi, workLogVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  REPORT_ROW_LIMIT,
  billabilityKpi,
  reportWorkLogInclude,
  type BillabilityKpi,
} from "@/lib/reporting/aggregations";
import {
  readReportFilters,
  reportFilterQuery,
  workLogReportWhere,
} from "@/lib/reporting/filters";
import {
  loadReportFilterOptions,
  type ReportFilterOptions,
} from "@/lib/reporting/options";
import { firstParam } from "@/lib/search-params";

export const dynamic = "force-dynamic";

const EMPTY_OPTIONS: ReportFilterOptions = {
  subjects: [],
  projects: [],
  cases: [],
  users: [],
};

const EMPTY_KPI: BillabilityKpi = {
  billableHours: 0,
  nonBillableHours: 0,
  needsApprovalHours: 0,
  totalHours: 0,
  ratio: 0,
  billableAmount: 0,
  billableCount: 0,
  nonBillableCount: 0,
  needsApprovalCount: 0,
  totalCount: 0,
};

const percentFormatter = new Intl.NumberFormat("cs-CZ", {
  style: "percent",
  maximumFractionDigits: 1,
});

type BillabilityData = {
  allowed: boolean;
  kpi: BillabilityKpi;
  capped: boolean;
  options: ReportFilterOptions;
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-black/10 p-3">
      <p className="text-xs uppercase tracking-wide text-black/50">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-black/50">{hint}</p> : null}
    </div>
  );
}

export default async function BillabilityReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = readReportFilters((key) => firstParam(params, key));

  const result = await safeQuery<BillabilityData>(
    { allowed: false, kpi: EMPTY_KPI, capped: false, options: EMPTY_OPTIONS },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();

      if (!canViewBillabilityKpi(currentUser)) {
        return {
          allowed: false,
          kpi: EMPTY_KPI,
          capped: false,
          options: EMPTY_OPTIONS,
        };
      }

      const [workLogs, options] = await Promise.all([
        prisma.workLog.findMany({
          where: andWhere(
            workLogReportWhere(filters),
            workLogVisibilityWhere(currentUser),
          ),
          include: reportWorkLogInclude,
          take: REPORT_ROW_LIMIT,
        }),
        loadReportFilterOptions(prisma, currentUser),
      ]);

      return {
        allowed: true,
        kpi: billabilityKpi(workLogs),
        capped: workLogs.length >= REPORT_ROW_LIMIT,
        options,
      };
    },
  );

  const { allowed, kpi } = result.data;
  const query = reportFilterQuery(filters);
  const exportSuffix = query ? `&${query}` : "";

  return (
    <>
      <PageHeader
        title="KPI fakturovatelnosti"
        description="Podíl fakturovatelných hodin na všech odpracovaných (z viditelných výkazů práce)."
        action={
          <ButtonLink href="/reports" variant="ghost">
            Zpět na reporty
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      {result.databaseReady && !allowed ? (
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            Nemáte oprávnění zobrazit KPI fakturovatelnosti.
          </p>
        </Section>
      ) : null}
      {allowed ? (
        <>
          <Section title="Filtry">
            <ReportFilterForm filters={filters} options={result.data.options} />
          </Section>
          <Section title="Fakturovatelnost">
            <div className="mb-3 flex flex-wrap gap-2">
              <ButtonLink
                href={`/reports/work-logs/export?format=xlsx${exportSuffix}`}
                variant="secondary"
              >
                Export výkazů
              </ButtonLink>
            </div>
            {result.data.capped ? (
              <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Zobrazeno prvních {REPORT_ROW_LIMIT} výkazů a KPI z nich. Zužte
                filtr, nebo použijte export pro kompletní data.
              </p>
            ) : null}
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Fakturovatelnost"
                value={percentFormatter.format(kpi.ratio)}
                hint="Fakturovatelné ÷ odpracované hodiny"
              />
              <KpiCard
                label="Fakturovatelné hodiny"
                value={formatHours(kpi.billableHours)}
                hint={`${kpi.billableCount} položek`}
              />
              <KpiCard
                label="Ke schválení"
                value={formatHours(kpi.needsApprovalHours)}
                hint={`${kpi.needsApprovalCount} položek (mimo poměr)`}
              />
              <KpiCard
                label="Nefakturovatelné hodiny"
                value={formatHours(kpi.nonBillableHours)}
                hint={`${kpi.nonBillableCount} položek`}
              />
              <KpiCard
                label="Hodiny celkem"
                value={formatHours(kpi.totalHours)}
                hint={`${kpi.totalCount} položek`}
              />
              <KpiCard
                label="Fakturovatelná částka"
                value={formatMoney(kpi.billableAmount)}
              />
            </div>
          </Section>
        </>
      ) : null}
    </>
  );
}
