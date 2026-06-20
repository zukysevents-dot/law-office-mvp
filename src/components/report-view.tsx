import { ReportFilterForm } from "@/components/report-filter-form";
import { ReportSummaryTable } from "@/components/report-summary-table";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import {
  andWhere,
  canViewAllLegalData,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  REPORT_ROW_LIMIT,
  reportWorkLogInclude,
  type ReportSummaryRow,
  type ReportWorkLog,
} from "@/lib/reporting/aggregations";
import {
  readReportFilters,
  workLogReportWhere,
  type ReportFilters,
} from "@/lib/reporting/filters";
import {
  loadReportFilterOptions,
  type ReportFilterOptions,
} from "@/lib/reporting/options";
import { filterQuery, firstParam } from "@/lib/search-params";

type GateUser = Parameters<typeof canViewAllLegalData>[0];

const EMPTY_OPTIONS: ReportFilterOptions = {
  subjects: [],
  projects: [],
  cases: [],
  users: [],
};

type ReportViewData = {
  allowed: boolean;
  rows: ReportSummaryRow[];
  capped: boolean;
  options: ReportFilterOptions;
};

// Shared scaffold for the grouped work-log report views. Each page supplies its
// labels and the aggregation that turns the visibility-scoped work logs into
// summary rows. The matching workLogVisibilityWhere(user) is always composed in
// — gating is layered on top by the caller, never instead of visibility.
export async function ReportView({
  title,
  description,
  labelHeader,
  aggregate,
  searchParams,
  canView,
  deniedMessage,
}: {
  title: string;
  description: string;
  labelHeader: string;
  aggregate: (rows: ReportWorkLog[]) => ReportSummaryRow[];
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  // Optional role gate. When supplied and the user fails it, the report renders
  // the "Přístup odepřen" notice. Visibility scoping is applied regardless.
  canView?: (user: GateUser) => boolean;
  deniedMessage?: string;
}) {
  const params = await searchParams;
  const filters: ReportFilters = readReportFilters((key) =>
    firstParam(params, key),
  );

  const result = await safeQuery<ReportViewData>(
    { allowed: false, rows: [], capped: false, options: EMPTY_OPTIONS },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();

      if (canView && !canView(currentUser)) {
        return { allowed: false, rows: [], capped: false, options: EMPTY_OPTIONS };
      }

      const [workLogs, options] = await Promise.all([
        prisma.workLog.findMany({
          where: andWhere(
            workLogReportWhere(filters),
            workLogVisibilityWhere(currentUser),
          ),
          orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
          include: reportWorkLogInclude,
          take: REPORT_ROW_LIMIT,
        }),
        loadReportFilterOptions(prisma, currentUser),
      ]);

      return {
        allowed: true,
        rows: aggregate(workLogs),
        capped: workLogs.length >= REPORT_ROW_LIMIT,
        options,
      };
    },
  );

  const { allowed } = result.data;
  const query = filterQuery(filters);
  const exportSuffix = query ? `&${query}` : "";

  return (
    <>
      <PageHeader
        title={title}
        description={description}
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
            {deniedMessage ?? "Nemáte oprávnění zobrazit tento report."}
          </p>
        </Section>
      ) : null}
      {allowed ? (
        <>
          <Section title="Filtry">
            <ReportFilterForm filters={filters} options={result.data.options} />
          </Section>
          <Section title={labelHeader}>
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
                Zobrazeno prvních {REPORT_ROW_LIMIT} výkazů a souhrny z nich.
                Zužte filtr, nebo použijte export pro kompletní data.
              </p>
            ) : null}
            <ReportSummaryTable labelHeader={labelHeader} rows={result.data.rows} />
          </Section>
        </>
      ) : null}
    </>
  );
}
