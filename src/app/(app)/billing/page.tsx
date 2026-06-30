import { FileSpreadsheet, FileDown } from "lucide-react";

import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  BILLING_ROW_LIMIT,
  billingFilterWhere,
  billingWorkLogInclude,
  invoiceableWorkLogWhere,
  readBillingFilters,
  type BillingWorkLog,
} from "@/lib/billing";
import { safeQuery } from "@/lib/db-safe";
import {
  formatCaseLabel,
  formatDateUtc,
  formatHours,
  formatMoney,
} from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { filterQuery, firstParam } from "@/lib/search-params";
import {
  andWhere,
  assertCanManageInvoices,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

type BillingProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SummaryRow = { key: string; hours: number; amount: number; count: number };

type BillingPageData = {
  rows: BillingWorkLog[];
  capped: boolean;
  bySubject: SummaryRow[];
  byProject: SummaryRow[];
  byCase: SummaryRow[];
  totals: { hours: number; amount: number; count: number };
  subjects: Array<{ id: string; name: string; ico: string | null }>;
  projects: Array<{ id: string; name: string }>;
  cases: Array<{ id: string; name: string; project: { name: string } }>;
  users: Array<{ id: string; name: string }>;
};

function summarize(
  rows: BillingWorkLog[],
  keyOf: (row: BillingWorkLog) => string,
) {
  const map = new Map<string, SummaryRow>();
  for (const row of rows) {
    const key = keyOf(row) || "Bez přiřazení";
    const entry = map.get(key) ?? { key, hours: 0, amount: 0, count: 0 };
    entry.hours += Number(row.hours ?? 0);
    entry.amount += Number(row.amountCzk ?? 0);
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export default async function BillingPage({ searchParams }: BillingProps) {
  const params = await searchParams;
  const filters = readBillingFilters((key) => firstParam(params, key));

  const result = await safeQuery<BillingPageData>(
    {
      rows: [],
      capped: false,
      bySubject: [],
      byProject: [],
      byCase: [],
      totals: { hours: 0, amount: 0, count: 0 },
      subjects: [],
      projects: [],
      cases: [],
      users: [],
    },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.BILLING);
      // Fakturace jen pro ADMIN/PARTNER + uživatele s grantem MANAGE_INVOICES.
      assertCanManageInvoices(currentUser);
      const [rows, subjects, projects, cases, users] = await Promise.all([
        prisma.workLog.findMany({
          where: andWhere(
            invoiceableWorkLogWhere,
            workLogVisibilityWhere(currentUser),
            billingFilterWhere(filters),
          ),
          orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
          include: billingWorkLogInclude,
          take: BILLING_ROW_LIMIT,
        }),
        prisma.subject.findMany({
          where: andWhere({ archivedAt: null }, subjectVisibilityWhere(currentUser)),
          orderBy: { name: "asc" },
          select: { id: true, name: true, ico: true },
        }),
        prisma.project.findMany({
          where: andWhere({ archivedAt: null }, projectVisibilityWhere(currentUser)),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.case.findMany({
          where: andWhere({ archivedAt: null }, caseVisibilityWhere(currentUser)),
          orderBy: { name: "asc" },
          select: { id: true, name: true, project: { select: { name: true } } },
        }),
        prisma.user.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);

      const totals = rows.reduce(
        (acc, row) => ({
          hours: acc.hours + Number(row.hours ?? 0),
          amount: acc.amount + Number(row.amountCzk ?? 0),
          count: acc.count + 1,
        }),
        { hours: 0, amount: 0, count: 0 },
      );

      return {
        rows,
        capped: rows.length >= BILLING_ROW_LIMIT,
        bySubject: summarize(rows, (row) => row.subject?.name ?? ""),
        byProject: summarize(rows, (row) => row.project?.name ?? ""),
        byCase: summarize(rows, (row) => formatCaseLabel(row.case, "")),
        totals,
        subjects,
        projects,
        cases,
        users,
      };
    },
  );

  const query = filterQuery(filters);
  const exportSuffix = query ? `&${query}` : "";

  return (
    <>
      <PageHeader
        title="Fakturace"
        description="Fakturační podklady – schválené a fakturovatelné výkazy práce, souhrny a export."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/billing/approvals" variant="secondary">
              Ke schválení
            </ButtonLink>
            <ButtonLink href="/billing/retainers" variant="secondary">
              Paušály
            </ButtonLink>
            <ButtonLink href="/billing/invoices">Faktury</ButtonLink>
          </div>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <Section title="Filtry">
        <form className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Subjekt">
              <SelectInput name="subjectId" defaultValue={filters.subjectId}>
                <option value="">Všechny subjekty</option>
                {result.data.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                    {subject.ico ? `, IČO ${subject.ico}` : ""}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Projekt">
              <SelectInput name="projectId" defaultValue={filters.projectId}>
                <option value="">Všechny projekty</option>
                {result.data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Případ">
              <SelectInput name="caseId" defaultValue={filters.caseId}>
                <option value="">Všechny případy</option>
                {result.data.cases.map((legalCase) => (
                  <option key={legalCase.id} value={legalCase.id}>
                    {legalCase.name} / {legalCase.project.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Pracovník">
              <SelectInput name="userId" defaultValue={filters.userId}>
                <option value="">Všichni pracovníci</option>
                {result.data.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Datum od">
              <TextInput name="dateFrom" type="date" defaultValue={filters.dateFrom} />
            </Field>
            <Field label="Datum do">
              <TextInput name="dateTo" type="date" defaultValue={filters.dateTo} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary">
              Filtrovat
            </Button>
            <ButtonLink
              href={`/billing/export?format=xlsx${exportSuffix}`}
              variant="primary"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Export do Excelu
            </ButtonLink>
            <ButtonLink
              href={`/billing/export?format=csv${exportSuffix}`}
              variant="ghost"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </ButtonLink>
          </div>
        </form>
      </Section>

      <Section title="Souhrny">
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-lg border border-black/10 p-3">
            <p className="text-xs uppercase tracking-wide text-black/50">
              Hodiny celkem
            </p>
            <p className="text-lg font-semibold">
              {formatHours(result.data.totals.hours)}
            </p>
          </div>
          <div className="rounded-lg border border-black/10 p-3">
            <p className="text-xs uppercase tracking-wide text-black/50">
              Částka celkem
            </p>
            <p className="text-lg font-semibold">
              {formatMoney(result.data.totals.amount)}
            </p>
          </div>
          <div className="rounded-lg border border-black/10 p-3">
            <p className="text-xs uppercase tracking-wide text-black/50">
              Počet položek
            </p>
            <p className="text-lg font-semibold">{result.data.totals.count}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <SummaryTable title="Podle klienta" rows={result.data.bySubject} />
          <SummaryTable title="Podle projektu" rows={result.data.byProject} />
          <SummaryTable title="Podle případu" rows={result.data.byCase} />
        </div>
      </Section>

      <Section title="Položky k fakturaci">
        {result.data.capped ? (
          <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Zobrazeno prvních {BILLING_ROW_LIMIT} položek a souhrny z nich.
            Zužte filtr, nebo použijte export pro kompletní podklady.
          </p>
        ) : null}
        {result.data.rows.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Klient</th>
                  <th>Projekt</th>
                  <th>Případ</th>
                  <th>Pracovník</th>
                  <th>Hodiny</th>
                  <th>Sazba</th>
                  <th>Částka</th>
                  <th>Právní oblast</th>
                  <th>Popis</th>
                </tr>
              </thead>
              <tbody>
                {result.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateUtc(row.workDate)}</td>
                    <td>{row.subject?.name ?? "—"}</td>
                    <td>{row.project?.name ?? "—"}</td>
                    <td>{formatCaseLabel(row.case)}</td>
                    <td>{row.user?.name ?? "—"}</td>
                    <td>{formatHours(row.hours)}</td>
                    <td>{formatMoney(row.hourlyRate)}</td>
                    <td>{formatMoney(row.amountCzk)}</td>
                    <td>{row.legalArea ?? "—"}</td>
                    <td className="max-w-md">{row.description ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>
            Žádné schválené fakturovatelné položky neodpovídají filtru.
          </EmptyState>
        )}
      </Section>
    </>
  );
}

function SummaryTable({ title, rows }: { title: string; rows: SummaryRow[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length > 0 ? (
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Název</th>
                <th>Hodiny</th>
                <th>Částka</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.key}</td>
                  <td>{formatHours(row.hours)}</td>
                  <td>{formatMoney(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>Žádná data.</EmptyState>
      )}
    </div>
  );
}
