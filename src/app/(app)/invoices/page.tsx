import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDateUtc, formatMoney } from "@/lib/format";
import {
  invoiceStatusLabels,
  invoiceStatusTone,
} from "@/lib/invoice-labels";
import { canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  issuedAt: Date;
  dueAt: Date;
  totalCzk: unknown;
  status: keyof typeof invoiceStatusLabels;
  subject: { name: string };
};

export default async function InvoicesPage() {
  const result = await safeQuery<{ invoices: InvoiceRow[]; allowed: boolean }>(
    { invoices: [], allowed: false },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      if (!canViewAllLegalData(currentUser)) {
        return { invoices: [], allowed: false };
      }
      const invoices = await prisma.invoice.findMany({
        where: { organizationId: currentUser.organizationId },
        orderBy: { issuedAt: "desc" },
        include: { subject: { select: { name: true } } },
      });
      return { invoices, allowed: true };
    },
  );

  return (
    <>
      <PageHeader
        title="Faktury"
        description="Vystavené faktury ze schválených podkladů."
        action={
          <ButtonLink href="/billing" variant="secondary">
            Fakturace
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <Section>
        {!result.data.allowed ? (
          <EmptyState>Faktury může spravovat pouze partner nebo admin.</EmptyState>
        ) : result.data.invoices.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Číslo</th>
                  <th>Klient</th>
                  <th>Vystaveno</th>
                  <th>Splatnost</th>
                  <th>Částka</th>
                  <th>Stav</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {result.data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="font-medium">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="text-emerald-950 hover:underline"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td>{invoice.subject.name}</td>
                    <td>{formatDateUtc(invoice.issuedAt)}</td>
                    <td>{formatDateUtc(invoice.dueAt)}</td>
                    <td>{formatMoney(invoice.totalCzk as never)}</td>
                    <td>
                      <Badge tone={invoiceStatusTone(invoice.status)}>
                        {invoiceStatusLabels[invoice.status]}
                      </Badge>
                    </td>
                    <td>
                      <ButtonLink
                        href={`/invoices/${invoice.id}`}
                        variant="ghost"
                        className="h-8 px-3"
                      >
                        Detail
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            action={
              <ButtonLink href="/billing">Přejít na fakturaci</ButtonLink>
            }
          >
            Zatím žádné faktury. Vytvořte fakturu ve Fakturaci (filtr podle klienta
            → Vytvořit fakturu).
          </EmptyState>
        )}
      </Section>
    </>
  );
}
