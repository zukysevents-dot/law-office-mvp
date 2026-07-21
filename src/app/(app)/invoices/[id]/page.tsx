import QRCode from "qrcode";
import { notFound } from "next/navigation";

import { markInvoicePaid, sendInvoiceReminder } from "@/app/actions/invoices";
import { PrintButton } from "@/components/print-button";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { formatDateUtc, formatHours, formatMoney } from "@/lib/format";
import { invoiceVariableSymbol } from "@/lib/invoice";
import { invoiceStatusLabels, invoiceStatusTone } from "@/lib/invoice-labels";
import { czAccountToIban, spdPaymentString } from "@/lib/payment-qr";
import { canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function Line({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p>
      <span className="text-black/50">{label}: </span>
      {value}
    </p>
  );
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!canViewAllLegalData(currentUser)) {
    notFound();
  }

  const prisma = getPrisma();
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      subject: {
        select: { name: true, ico: true, dic: true, address: true, email: true },
      },
      organization: {
        select: {
          name: true,
          ico: true,
          dic: true,
          address: true,
          email: true,
          phone: true,
          bankAccount: true,
          vatPayer: true,
        },
      },
      lineItems: { orderBy: { id: "asc" } },
    },
  });
  if (!invoice || invoice.organizationId !== currentUser.organizationId) {
    notFound();
  }

  const org = invoice.organization;
  const subject = invoice.subject;
  const vs = invoiceVariableSymbol(invoice.year, invoice.seq);
  const isVat = invoice.vatRate > 0;

  // F4: Czech QR payment (SPD). Only when we can derive a valid IBAN.
  const iban = czAccountToIban(org.bankAccount);
  const qrSvg = iban
    ? await QRCode.toString(
        spdPaymentString({
          iban,
          amount: Number(invoice.totalCzk),
          variableSymbol: vs,
          message: invoice.invoiceNumber,
        }),
        { type: "svg", margin: 0, width: 132 },
      )
    : null;

  // F3: overdue reminder controls (screen only, not on the printed doc).
  const now = new Date();
  const isOverdue =
    invoice.status === "ISSUED" && invoice.dueAt.getTime() < now.getTime();
  const mailtoHref = `mailto:${subject.email ?? ""}?subject=${encodeURIComponent(
    `Upomínka – faktura ${invoice.invoiceNumber}`,
  )}&body=${encodeURIComponent(
    `Dobrý den,\n\ndovolujeme si upozornit, že faktura ${invoice.invoiceNumber} se splatností ${formatDateUtc(invoice.dueAt)} nebyla dosud uhrazena. Prosíme o kontrolu.\n\nDěkujeme.`,
  )}`;

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href="/invoices" variant="ghost" className="h-9 px-3">
          ← Faktury
        </ButtonLink>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={invoiceStatusTone(invoice.status)}>
            {invoiceStatusLabels[invoice.status]}
          </Badge>
          {invoice.status !== "PAID" ? (
            <form action={markInvoicePaid}>
              <input type="hidden" name="id" value={invoice.id} />
              <Button type="submit" variant="secondary">
                Označit jako zaplaceno
              </Button>
            </form>
          ) : null}
          {isOverdue ? (
            <>
              <ButtonLink href={mailtoHref} variant="ghost" className="h-9 px-3">
                Napsat upomínku
              </ButtonLink>
              <form action={sendInvoiceReminder}>
                <input type="hidden" name="id" value={invoice.id} />
                <Button type="submit" variant="secondary">
                  Zaznamenat upomínku
                </Button>
              </form>
            </>
          ) : null}
          <PrintButton />
        </div>
      </div>

      <div className="invoice-doc mx-auto w-full max-w-3xl rounded-lg border border-black/10 bg-white p-8 text-sm text-[#111]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-lg font-bold uppercase tracking-wide">
              {isVat ? "Faktura – daňový doklad" : "Faktura"}
            </h1>
            <p className="mt-1 text-2xl font-semibold">{invoice.invoiceNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-black/50">Variabilní symbol</p>
            <p className="text-lg font-semibold">{vs}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="grid gap-1">
            <p className="text-xs font-semibold uppercase text-black/50">
              Dodavatel
            </p>
            <p className="text-base font-semibold">{org.name}</p>
            <Line label="Adresa" value={org.address} />
            <Line label="IČO" value={org.ico} />
            <Line label="DIČ" value={org.dic} />
            <Line label="E-mail" value={org.email} />
            <Line label="Telefon" value={org.phone} />
          </div>
          <div className="grid gap-1">
            <p className="text-xs font-semibold uppercase text-black/50">
              Odběratel
            </p>
            <p className="text-base font-semibold">{subject.name}</p>
            <Line label="Adresa" value={subject.address} />
            <Line label="IČO" value={subject.ico} />
            <Line label="DIČ" value={subject.dic} />
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-black/50">Datum vystavení</p>
            <p className="font-medium">{formatDateUtc(invoice.issuedAt)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-black/50">
              Datum zdanitelného plnění
            </p>
            <p className="font-medium">{formatDateUtc(invoice.taxableSupplyAt)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-black/50">Datum splatnosti</p>
            <p className="font-medium">{formatDateUtc(invoice.dueAt)}</p>
          </div>
        </div>

        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/20 text-left">
              <th className="py-2">Popis</th>
              <th className="py-2 text-right">Hodiny</th>
              <th className="py-2 text-right">Sazba</th>
              <th className="py-2 text-right">Částka</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item) => (
              <tr key={item.id} className="border-b border-black/10 align-top">
                <td className="py-2 pr-4">{item.description}</td>
                <td className="py-2 text-right">{formatHours(item.quantity)}</td>
                <td className="py-2 text-right">{formatMoney(item.unitPrice)}</td>
                <td className="py-2 text-right">{formatMoney(item.amountCzk)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs grid gap-1">
            <div className="flex justify-between">
              <span className="text-black/60">Základ</span>
              <span>{formatMoney(invoice.subtotalCzk)}</span>
            </div>
            {isVat ? (
              <div className="flex justify-between">
                <span className="text-black/60">DPH {invoice.vatRate} %</span>
                <span>{formatMoney(invoice.vatCzk)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between border-t border-black/20 pt-2 text-base font-semibold">
              <span>Celkem k úhradě</span>
              <span>{formatMoney(invoice.totalCzk)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-start justify-between gap-6 border-t border-black/10 pt-4 text-sm">
          <div className="grid gap-1">
            <Line label="Bankovní účet" value={org.bankAccount} />
            {iban ? <Line label="IBAN" value={iban} /> : null}
            <Line label="Variabilní symbol" value={vs} />
            {invoice.note ? <p className="text-black/70">{invoice.note}</p> : null}
          </div>
          {qrSvg ? (
            <div className="shrink-0 text-center">
              <div
                className="h-[132px] w-[132px]"
                // qrcode output is a trusted, self-generated SVG (no user HTML).
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <p className="mt-1 text-xs text-black/50">QR Platba</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
