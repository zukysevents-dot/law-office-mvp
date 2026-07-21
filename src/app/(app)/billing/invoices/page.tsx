import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceStatus, ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatusLabels } from "@/lib/labels";
import {
  invoiceListInclude,
  isPastDue,
  type InvoiceListRow,
} from "@/lib/invoices";
import {
  andWhere,
  assertCanManageInvoices,
  invoiceVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { invoiceStatusTone } from "@/lib/status-tones";
import { firstParam, parseDateBoundary } from "@/lib/search-params";

export const dynamic = "force-dynamic";

const INVOICE_ROW_LIMIT = 500;

type InvoicesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const params = await searchParams;
  const q = firstParam(params, "q");
  const status = firstParam(params, "status");
  const dateFrom = firstParam(params, "dateFrom");
  const dateTo = firstParam(params, "dateTo");
  const dateFromBoundary = parseDateBoundary(dateFrom, false);
  const dateToBoundary = parseDateBoundary(dateTo, true);
  const hasFilters = Boolean(q || status || dateFrom || dateTo);
  const result = await safeQuery<{ rows: InvoiceListRow[] }>(
    { rows: [] },
    async () => {
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.BILLING);
      assertCanManageInvoices(currentUser);
      const rows = await getPrisma().invoice.findMany({
        where: andWhere(invoiceVisibilityWhere(currentUser), {
          ...(q
            ? {
                OR: [
                  { number: { contains: q, mode: "insensitive" } },
                  { subject: { is: { name: { contains: q, mode: "insensitive" } } } },
                ],
              }
            : {}),
          ...(Object.values(InvoiceStatus).includes(status as InvoiceStatus)
            ? { status: status as InvoiceStatus }
            : {}),
          ...(dateFromBoundary || dateToBoundary
            ? {
                issueDate: {
                  ...(dateFromBoundary ? { gte: dateFromBoundary } : {}),
                  ...(dateToBoundary ? { lte: dateToBoundary } : {}),
                },
              }
            : {}),
        }),
        orderBy: [{ createdAt: "desc" }],
        include: invoiceListInclude,
        take: INVOICE_ROW_LIMIT,
      });
      return { rows };
    },
  );

  const rows = result.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Faktury"
        description="Vyhledávatelný archiv vystavených a rozpracovaných faktur klientům."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/billing" variant="secondary">
              Podklady k fakturaci
            </ButtonLink>
            <ButtonLink href="/work-logs?archive=all" variant="secondary">
              Výkazy práce
            </ButtonLink>
            <ButtonLink href="/billing/invoices/new">Nová faktura</ButtonLink>
          </div>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <Section title="Vyhledávání a filtry">
        <form className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Číslo nebo klient">
              <TextInput name="q" defaultValue={q} placeholder="Hledat…" />
            </Field>
            <Field label="Stav">
              <SelectInput name="status" defaultValue={status}>
                <option value="">Všechny stavy</option>
                {Object.values(InvoiceStatus).map((value) => (
                  <option key={value} value={value}>
                    {invoiceStatusLabels[value]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Vystaveno od">
              <TextInput name="dateFrom" type="date" defaultValue={dateFrom} />
            </Field>
            <Field label="Vystaveno do">
              <TextInput name="dateTo" type="date" defaultValue={dateTo} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary">
              Filtrovat
            </Button>
            {hasFilters ? (
              <ButtonLink href="/billing/invoices" variant="ghost">
                Zrušit filtry
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </Section>

      <Section title="Přehled faktur">
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Číslo</th>
                  <th>Klient</th>
                  <th>Vystaveno</th>
                  <th>Splatnost</th>
                  <th>Stav</th>
                  <th className="text-right">Celkem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="font-medium text-stone-950">
                      <a
                        href={`/billing/invoices/${invoice.id}`}
                        className="text-[#072924] underline-offset-2 hover:underline"
                      >
                        {invoice.number ?? "Rozpracovaná"}
                      </a>
                    </td>
                    <td>{invoice.subject.name}</td>
                    <td>{formatDate(invoice.issueDate)}</td>
                    <td>{formatDate(invoice.dueDate)}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={invoiceStatusTone(invoice.status)}>
                          {invoiceStatusLabels[invoice.status]}
                        </Badge>
                        {isPastDue(invoice) ? (
                          <Badge tone="red">Po splatnosti</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-right font-medium text-stone-950">
                      {formatMoney(invoice.totalCzk)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>
            Zatím nebyly vystaveny žádné faktury. Vytvořte první z podkladů k
            fakturaci.
          </EmptyState>
        )}
      </Section>
    </>
  );
}
