import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { BillingStatus } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import {
  formatCaseLabel,
  formatDateUtc,
  formatHours,
  formatMoney,
} from "@/lib/format";
import {
  andWhere,
  canViewRates,
  subjectVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { firstParam, parseDateBoundary } from "@/lib/search-params";
import {
  computeTimesheetTotals,
  parseBoolean,
  parseTimesheetScope,
  resolveShowAmounts,
  type TimesheetScope,
  type TimesheetTotals,
} from "@/lib/timesheet";

export const dynamic = "force-dynamic";

type TimesheetRow = {
  id: string;
  workDate: Date;
  hours: unknown;
  hourlyRate: unknown;
  amountCzk: unknown;
  description: string | null;
  project: { name: string } | null;
  case: { name: string; fileNumber: string | null } | null;
  user: { name: string } | null;
};

type TimesheetData = {
  rows: TimesheetRow[];
  totals: TimesheetTotals;
  clientName: string | null;
  office: { legalName: string; ico: string | null } | null;
  canViewRates: boolean;
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientTimesheetPage({ searchParams }: Props) {
  const params = await searchParams;
  const subjectId = firstParam(params, "subjectId");
  const projectId = firstParam(params, "projectId");
  const caseId = firstParam(params, "caseId");
  const dateFrom = firstParam(params, "dateFrom");
  const dateTo = firstParam(params, "dateTo");
  const scope: TimesheetScope = parseTimesheetScope(firstParam(params, "scope"));
  // Show-amounts is requested via URL but only honored when the role may see
  // pricing — resolved against canViewRates below (never trust the query alone).
  const amountsRequested = parseBoolean(firstParam(params, "amounts"), true);
  // Validate dates via the shared helper so a malformed query string yields
  // undefined (filter skipped) instead of an Invalid Date → Prisma error.
  const from = parseDateBoundary(dateFrom, false);
  const to = parseDateBoundary(dateTo, true);

  const result = await safeQuery<TimesheetData>(
    {
      rows: [],
      totals: { count: 0, totalHours: 0, totalAmountCzk: 0 },
      clientName: null,
      office: null,
      canViewRates: false,
    },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();

      const rows = await prisma.workLog.findMany({
        where: andWhere(workLogVisibilityWhere(currentUser), {
          archivedAt: null,
          ...(subjectId ? { subjectId } : {}),
          ...(projectId ? { projectId } : {}),
          ...(caseId ? { caseId } : {}),
          // "billable" = jen to, co se klientovi účtuje.
          ...(scope === "billable"
            ? { billingStatus: BillingStatus.BILLABLE }
            : {}),
          ...(from || to
            ? {
                workDate: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        }),
        orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
        take: 1000,
        select: {
          id: true,
          workDate: true,
          hours: true,
          hourlyRate: true,
          amountCzk: true,
          description: true,
          project: { select: { name: true } },
          case: { select: { name: true, fileNumber: true } },
          user: { select: { name: true } },
        },
      });

      const client = subjectId
        ? await prisma.subject.findFirst({
            where: andWhere(subjectVisibilityWhere(currentUser), {
              id: subjectId,
            }),
            select: { name: true },
          })
        : null;

      const office = await prisma.organizationBillingProfile.findUnique({
        where: { organizationId: currentUser.organizationId },
        select: { legalName: true, ico: true },
      });

      return {
        rows,
        totals: computeTimesheetTotals(
          rows.map((row) => ({
            hours: row.hours as never,
            amountCzk: row.amountCzk as never,
          })),
        ),
        clientName: client?.name ?? null,
        office,
        canViewRates: canViewRates(currentUser),
      };
    },
  );

  const data = result.data;
  const showAmounts = resolveShowAmounts(data.canViewRates, amountsRequested);
  const periodLabel =
    from || to
      ? `${from ? formatDateUtc(from) : "…"} – ${to ? formatDateUtc(to) : "…"}`
      : "celé období";

  // Carry the scope filters back into the config form so a reload preserves them.
  const hiddenScopeFilters = (
    <>
      {subjectId ? (
        <input type="hidden" name="subjectId" value={subjectId} />
      ) : null}
      {projectId ? (
        <input type="hidden" name="projectId" value={projectId} />
      ) : null}
      {caseId ? <input type="hidden" name="caseId" value={caseId} /> : null}
    </>
  );

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Výkaz práce pro klienta"
          description="Tiskový výkaz odvedené práce — vytiskněte nebo uložte jako PDF."
          action={
            <div className="flex gap-2">
              <ButtonLink href="/work-logs" variant="secondary">
                Zpět na výkazy
              </ButtonLink>
              <PrintButton />
            </div>
          }
        />
        <DatabaseNotice
          databaseReady={result.databaseReady}
          error={result.error}
        />
        <Section title="Nastavení výkazu">
          <form className="grid gap-4">
            {hiddenScopeFilters}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Datum od">
                <TextInput name="dateFrom" type="date" defaultValue={dateFrom} />
              </Field>
              <Field label="Datum do">
                <TextInput name="dateTo" type="date" defaultValue={dateTo} />
              </Field>
              <Field label="Rozsah">
                <SelectInput name="scope" defaultValue={scope}>
                  <option value="billable">Jen fakturovatelné</option>
                  <option value="all">Veškerá evidovaná práce</option>
                </SelectInput>
              </Field>
              {data.canViewRates ? (
                <Field label="Sazby a částky">
                  <SelectInput
                    name="amounts"
                    defaultValue={amountsRequested ? "1" : "0"}
                  >
                    <option value="1">Zobrazit</option>
                    <option value="0">Skrýt</option>
                  </SelectInput>
                </Field>
              ) : null}
            </div>
            <div>
              <Button type="submit" variant="secondary">
                Použít nastavení
              </Button>
            </div>
          </form>
        </Section>
      </div>

      <article className="mx-auto max-w-4xl rounded-lg border border-[#d4e2dc] bg-white p-8 text-stone-900 shadow-sm print:border-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold text-[#072924]">
              Výkaz práce
            </h1>
            {data.clientName ? (
              <p className="mt-1 text-sm text-stone-700">
                Klient: <span className="font-medium">{data.clientName}</span>
              </p>
            ) : null}
            <p className="mt-1 text-sm text-stone-600">Období: {periodLabel}</p>
          </div>
          {data.office ? (
            <div className="text-right text-sm text-stone-700">
              <p className="font-medium">{data.office.legalName}</p>
              {data.office.ico ? <p>IČO: {data.office.ico}</p> : null}
            </div>
          ) : null}
        </header>

        {data.rows.length > 0 ? (
          <>
            <table className="mt-8 w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left">
                  <th className="py-2">Datum</th>
                  <th className="py-2">Případ</th>
                  <th className="py-2">Popis</th>
                  <th className="py-2 text-right">Hodiny</th>
                  {showAmounts ? (
                    <>
                      <th className="py-2 text-right">Sazba</th>
                      <th className="py-2 text-right">Částka</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-100 align-top">
                    <td className="py-2 whitespace-nowrap">
                      {formatDateUtc(row.workDate)}
                    </td>
                    <td className="py-2">
                      {formatCaseLabel(row.case, row.project?.name ?? "—")}
                    </td>
                    <td className="py-2">{row.description ?? "—"}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {formatHours(row.hours as never)}
                    </td>
                    {showAmounts ? (
                      <>
                        <td className="py-2 text-right whitespace-nowrap">
                          {formatMoney(row.hourlyRate as never)}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {formatMoney(row.amountCzk as never)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-300 font-semibold text-[#072924]">
                  <td className="py-2" colSpan={3}>
                    Celkem ({data.totals.count} položek)
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {formatHours(data.totals.totalHours)}
                  </td>
                  {showAmounts ? (
                    <>
                      <td className="py-2" />
                      <td className="py-2 text-right whitespace-nowrap">
                        {formatMoney(data.totals.totalAmountCzk)}
                      </td>
                    </>
                  ) : null}
                </tr>
              </tfoot>
            </table>

            <p className="mt-6 text-xs text-stone-400">
              {scope === "billable"
                ? "Výkaz obsahuje pouze fakturovatelnou práci."
                : "Výkaz obsahuje veškerou evidovanou práci."}
            </p>
          </>
        ) : (
          <div className="mt-8">
            <EmptyState>
              Pro zvolené období a rozsah nejsou žádné výkazy práce.
            </EmptyState>
          </div>
        )}
      </article>
    </>
  );
}
