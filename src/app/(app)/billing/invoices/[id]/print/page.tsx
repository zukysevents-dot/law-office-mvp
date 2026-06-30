import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { PrintButton } from "@/components/print-button";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import { vatModeLabels } from "@/lib/labels";
import { invoiceDetailInclude, type InvoiceDetail } from "@/lib/invoices";
import {
  andWhere,
  assertCanManageInvoices,
  invoiceVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SupplierSnap = {
  legalName?: string | null;
  ico?: string | null;
  dic?: string | null;
  address?: string | null;
  bankAccount?: string | null;
  iban?: string | null;
  vatPayer?: boolean | null;
};

type CustomerSnap = {
  name?: string | null;
  ico?: string | null;
  dic?: string | null;
  address?: string | null;
  vatPayer?: boolean | null;
};

type PrintData = {
  invoice: InvoiceDetail;
  supplier: SupplierSnap | null;
  customer: CustomerSnap | null;
};

function Party({
  title,
  lines,
}: {
  title: string;
  lines: Array<string | null | undefined>;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </p>
      <div className="mt-1 space-y-0.5 text-sm text-stone-800">
        {lines.filter(Boolean).map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </div>
  );
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await safeQuery<PrintData | null>(null, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.BILLING);
    assertCanManageInvoices(currentUser);
    const prisma = getPrisma();
    const invoice = await prisma.invoice.findFirst({
      where: andWhere(invoiceVisibilityWhere(currentUser), { id }),
      include: invoiceDetailInclude,
    });
    if (!invoice) {
      return null;
    }
    // Prefer the frozen snapshots (issued invoices); fall back to live data for
    // drafts so the preview still renders.
    const profile = invoice.supplierSnapshot
      ? null
      : await prisma.organizationBillingProfile.findUnique({
          where: { organizationId: invoice.organizationId },
        });
    const supplier =
      (invoice.supplierSnapshot as SupplierSnap | null) ??
      (profile
        ? {
            legalName: profile.legalName,
            ico: profile.ico,
            dic: profile.dic,
            address: profile.address,
            bankAccount: profile.bankAccount,
            iban: profile.iban,
            vatPayer: profile.vatPayer,
          }
        : null);
    const customer =
      (invoice.customerSnapshot as CustomerSnap | null) ?? {
        name: invoice.subject.name,
        ico: invoice.subject.ico,
        dic: invoice.subject.dic,
        address: invoice.subject.address,
        vatPayer: invoice.subject.vatPayer,
      };
    return { invoice, supplier, customer };
  });

  if (result.databaseReady && !result.data) {
    notFound();
  }

  const data = result.data;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <ButtonLink
          href={data ? `/billing/invoices/${data.invoice.id}` : "/billing/invoices"}
          variant="secondary"
        >
          Zpět na fakturu
        </ButtonLink>
        <PrintButton />
      </div>
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {data ? (
        <article className="rounded-lg border border-[#d4e2dc] bg-white p-8 text-stone-900 shadow-sm print:border-0 print:shadow-none">
          <header className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold text-[#072924]">Faktura</h1>
              <p className="mt-1 text-sm text-stone-600">
                č. {data.invoice.number ?? "(rozpracovaná)"}
              </p>
            </div>
            <div className="text-right text-sm text-stone-700">
              <p>Vystaveno: {formatDate(data.invoice.issueDate)}</p>
              <p>Splatnost: {formatDate(data.invoice.dueDate)}</p>
              <p>DUZP: {formatDate(data.invoice.taxDate)}</p>
              <p>VS: {data.invoice.variableSymbol ?? "—"}</p>
            </div>
          </header>

          <div className="mt-8 grid grid-cols-2 gap-8">
            <Party
              title="Dodavatel"
              lines={[
                data.supplier?.legalName,
                data.supplier?.address,
                data.supplier?.ico ? `IČO: ${data.supplier.ico}` : null,
                data.supplier?.dic ? `DIČ: ${data.supplier.dic}` : null,
                data.supplier?.bankAccount
                  ? `Účet: ${data.supplier.bankAccount}`
                  : null,
                data.supplier?.iban ? `IBAN: ${data.supplier.iban}` : null,
              ]}
            />
            <Party
              title="Odběratel"
              lines={[
                data.customer?.name,
                data.customer?.address,
                data.customer?.ico ? `IČO: ${data.customer.ico}` : null,
                data.customer?.dic ? `DIČ: ${data.customer.dic}` : null,
              ]}
            />
          </div>

          <table className="mt-8 w-full text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left">
                <th className="py-2">Popis</th>
                <th className="py-2 text-right">Množství</th>
                <th className="py-2 text-right">Cena/j.</th>
                <th className="py-2 text-right">DPH %</th>
                <th className="py-2 text-right">Celkem</th>
              </tr>
            </thead>
            <tbody>
              {data.invoice.lines.map((line) => (
                <tr key={line.id} className="border-b border-stone-100">
                  <td className="py-2">{line.description}</td>
                  <td className="py-2 text-right">
                    {formatHours(line.quantity)} {line.unit}
                  </td>
                  <td className="py-2 text-right">
                    {formatMoney(line.unitPriceCzk)}
                  </td>
                  <td className="py-2 text-right">{Number(line.vatRate)} %</td>
                  <td className="py-2 text-right">{formatMoney(line.amountCzk)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex justify-end">
            <dl className="grid w-64 gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">Základ</dt>
                <dd>{formatMoney(data.invoice.subtotalCzk)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">DPH</dt>
                <dd>{formatMoney(data.invoice.vatCzk)}</dd>
              </div>
              <div className="flex justify-between border-t border-stone-300 pt-1 text-base font-semibold text-[#072924]">
                <dt>Celkem k úhradě</dt>
                <dd>{formatMoney(data.invoice.totalCzk)}</dd>
              </div>
            </dl>
          </div>

          {data.invoice.vatMode === "NON_PAYER" ? (
            <p className="mt-6 text-sm text-stone-600">
              Dodavatel není plátcem DPH.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-stone-400">
            Režim DPH: {vatModeLabels[data.invoice.vatMode]}
          </p>
        </article>
      ) : null}
    </div>
  );
}
