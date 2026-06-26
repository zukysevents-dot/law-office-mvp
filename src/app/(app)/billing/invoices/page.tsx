import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey } from "@/generated/prisma/enums";
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
import { andWhere, invoiceVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { invoiceStatusTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

const INVOICE_ROW_LIMIT = 500;

export default async function InvoicesPage() {
  const result = await safeQuery<{ rows: InvoiceListRow[] }>(
    { rows: [] },
    async () => {
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.BILLING);
      const rows = await getPrisma().invoice.findMany({
        where: andWhere(invoiceVisibilityWhere(currentUser)),
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
        description="Vystavené a rozpracované faktury klientům."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/billing" variant="secondary">
              Podklady k fakturaci
            </ButtonLink>
            <ButtonLink href="/billing/invoices/new">Nová faktura</ButtonLink>
          </div>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

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
