import { notFound } from "next/navigation";

import {
  cancelInvoice,
  deleteDraftInvoice,
  issueInvoice,
} from "@/app/actions/invoices";
import { recordPayment } from "@/app/actions/payments";
import { markInvoiceSent, sendReminder } from "@/app/actions/reminders";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { InvoiceEmailForm } from "@/components/invoice-email-form";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { ModuleKey, PaymentMethod, ReminderLevel } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatCaseLabel, formatDate, formatHours, formatMoney } from "@/lib/format";
import {
  invoiceStatusLabels,
  paymentMethodLabels,
  reminderLevelLabels,
  vatModeLabels,
} from "@/lib/labels";
import {
  invoiceDetailInclude,
  type InvoiceDetail,
} from "@/lib/invoices";
import {
  andWhere,
  assertCanManageInvoices,
  invoiceVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { invoiceStatusTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await safeQuery<InvoiceDetail | null>(null, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.BILLING);
    assertCanManageInvoices(currentUser);
    return getPrisma().invoice.findFirst({
      where: andWhere(invoiceVisibilityWhere(currentUser), { id }),
      include: invoiceDetailInclude,
    });
  });

  if (result.databaseReady && !result.data) {
    notFound();
  }

  const invoice = result.data;
  const isDraft = invoice?.status === "DRAFT";
  const isCancelled = invoice?.status === "CANCELLED";
  const paidTotal = invoice
    ? invoice.payments.reduce((sum, p) => sum + Number(p.amountCzk), 0)
    : 0;
  const remaining = invoice ? Number(invoice.totalCzk) - paidTotal : 0;

  return (
    <>
      <PageHeader
        title={invoice?.number ?? "Rozpracovaná faktura"}
        description={invoice ? invoice.subject.name : "Detail faktury"}
        action={
          <div className="flex gap-2">
            <ButtonLink href="/billing/invoices" variant="secondary">
              Zpět na faktury
            </ButtonLink>
            {invoice && !isDraft ? (
              <ButtonLink
                href={`/billing/invoices/${invoice.id}/print`}
                variant="ghost"
              >
                Tisk / PDF
              </ButtonLink>
            ) : null}
            {invoice && !isDraft && !isCancelled ? (
              <ButtonLink
                href={`/billing/invoices/${invoice.id}/isdoc`}
                variant="ghost"
              >
                Export ISDOC
              </ButtonLink>
            ) : null}
            {invoice && !isDraft && !isCancelled ? (
              <ButtonLink
                href={`/billing/invoices/${invoice.id}/pohoda`}
                variant="ghost"
              >
                Export Pohoda
              </ButtonLink>
            ) : null}
          </div>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {invoice ? (
        <>
          <Section title="Údaje faktury">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-stone-500">Stav</dt>
                <dd className="mt-1">
                  <Badge tone={invoiceStatusTone(invoice.status)}>
                    {invoiceStatusLabels[invoice.status]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">Klient</dt>
                <dd className="mt-1 text-sm font-medium text-[#072924]">
                  {invoice.subject.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">Spis</dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {formatCaseLabel(invoice.case, invoice.project?.name ?? "—")}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">Vystaveno</dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {formatDate(invoice.issueDate)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">Splatnost</dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {formatDate(invoice.dueDate)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">
                  Variabilní symbol
                </dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {invoice.variableSymbol ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">Režim DPH</dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {vatModeLabels[invoice.vatMode]}
                </dd>
              </div>
            </dl>
          </Section>

          <Section title="Položky">
            <div className="table-scroll">
              <table className="w-max min-w-full">
                <thead>
                  <tr>
                    <th>Popis</th>
                    <th className="text-right">Množství</th>
                    <th>Jedn.</th>
                    <th className="text-right">Cena/j.</th>
                    <th className="text-right">DPH %</th>
                    <th className="text-right">Základ</th>
                    <th className="text-right">DPH</th>
                    <th className="text-right">Celkem</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="font-medium text-stone-950">
                        {line.description}
                      </td>
                      <td className="text-right">{formatHours(line.quantity)}</td>
                      <td>{line.unit}</td>
                      <td className="text-right">
                        {formatMoney(line.unitPriceCzk)}
                      </td>
                      <td className="text-right">{Number(line.vatRate)} %</td>
                      <td className="text-right">{formatMoney(line.lineBaseCzk)}</td>
                      <td className="text-right">{formatMoney(line.lineVatCzk)}</td>
                      <td className="text-right font-medium text-stone-950">
                        {formatMoney(line.amountCzk)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-4 ml-auto grid max-w-xs gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">Základ</dt>
                <dd className="font-medium">{formatMoney(invoice.subtotalCzk)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">DPH</dt>
                <dd className="font-medium">{formatMoney(invoice.vatCzk)}</dd>
              </div>
              <div className="flex justify-between border-t border-[#d4e2dc] pt-1 text-base">
                <dt className="font-semibold text-[#072924]">Celkem</dt>
                <dd className="font-semibold text-[#072924]">
                  {formatMoney(invoice.totalCzk)}
                </dd>
              </div>
            </dl>
          </Section>

          {isDraft ? (
            <Section title="Vystavit fakturu">
              <p className="mb-4 text-sm text-stone-600">
                Vystavením se faktuře přidělí číslo z řady a stane se neměnnou.
                Zdrojové výkazy se uzamknou proti opětovné fakturaci.
              </p>
              <form action={issueInvoice} className="grid gap-4">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Datum vystavení">
                    <TextInput
                      name="issueDate"
                      type="date"
                      defaultValue={todayInputValue()}
                    />
                  </Field>
                  <Field label="Datum splatnosti (volitelné)">
                    <TextInput name="dueDate" type="date" />
                  </Field>
                  <Field label="DUZP (volitelné)">
                    <TextInput name="taxDate" type="date" />
                  </Field>
                  <Field label="Variabilní symbol (volitelné)">
                    <TextInput name="variableSymbol" />
                  </Field>
                </div>
                <p className="text-sm text-stone-600">
                  Režim DPH ({vatModeLabels[invoice.vatMode]}) se řídí
                  fakturačními údaji kanceláře.
                </p>
                <div className="flex gap-2">
                  <Button type="submit">Vystavit fakturu</Button>
                </div>
              </form>
              <form action={deleteDraftInvoice} className="mt-4">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <Button type="submit" variant="danger">
                  Smazat rozpracovanou fakturu
                </Button>
              </form>
            </Section>
          ) : null}

          {!isDraft && !isCancelled ? (
            <>
              <Section title="Odeslání klientovi">
                <InvoiceEmailForm
                  invoiceId={invoice.id}
                  defaultRecipient={invoice.subject.email ?? ""}
                />
                {invoice.status === "ISSUED" ? (
                  <form action={markInvoiceSent} className="mt-4">
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <Button type="submit" variant="ghost">
                      Jen označit jako odeslanou (bez e-mailu)
                    </Button>
                  </form>
                ) : null}
              </Section>

              <Section title="Úhrady">
                <dl className="mb-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium text-stone-500">
                      Uhrazeno
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-[#072924]">
                      {formatMoney(paidTotal)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-stone-500">
                      Zbývá uhradit
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-[#072924]">
                      {formatMoney(Math.max(0, remaining))}
                    </dd>
                  </div>
                </dl>
                {invoice.payments.length > 0 ? (
                  <div className="table-scroll">
                    <table className="w-max min-w-full">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Metoda</th>
                          <th className="text-right">Částka</th>
                          <th>Poznámka</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td>{formatDate(payment.paidAt)}</td>
                            <td>{paymentMethodLabels[payment.method]}</td>
                            <td className="text-right">
                              {formatMoney(payment.amountCzk)}
                            </td>
                            <td>{payment.note ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-stone-600">
                    Zatím bez evidované úhrady.
                  </p>
                )}
                {invoice.status !== "PAID" ? (
                  <form
                    action={recordPayment}
                    className="mt-4 grid gap-3 sm:max-w-lg"
                  >
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Částka (Kč)">
                      <TextInput
                        name="amountCzk"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={remaining > 0 ? remaining.toFixed(2) : ""}
                        required
                      />
                    </Field>
                    <Field label="Datum úhrady">
                      <TextInput
                        name="paidAt"
                        type="date"
                        defaultValue={todayInputValue()}
                      />
                    </Field>
                    <Field label="Metoda">
                      <SelectInput name="method" defaultValue="BANK_TRANSFER">
                        {Object.values(PaymentMethod).map((method) => (
                          <option key={method} value={method}>
                            {paymentMethodLabels[method]}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Poznámka (volitelné)">
                      <TextInput name="note" />
                    </Field>
                  </div>
                    <div>
                      <Button type="submit">Zaznamenat úhradu</Button>
                    </div>
                  </form>
                ) : null}
              </Section>

              {invoice.status !== "PAID" ? (
                <Section title="Upomínky">
                  {invoice.reminders.length > 0 ? (
                    <div className="table-scroll">
                      <table className="w-max min-w-full">
                        <thead>
                          <tr>
                            <th>Datum</th>
                            <th>Úroveň</th>
                            <th>Poznámka</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.reminders.map((reminder) => (
                            <tr key={reminder.id}>
                              <td>{formatDate(reminder.sentAt)}</td>
                              <td>{reminderLevelLabels[reminder.level]}</td>
                              <td>{reminder.note ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-stone-600">Zatím bez upomínky.</p>
                  )}
                  <form
                    action={sendReminder}
                    className="mt-4 grid gap-3 sm:max-w-lg"
                  >
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Úroveň">
                        <SelectInput name="level" defaultValue="FIRST">
                          {Object.values(ReminderLevel).map((level) => (
                            <option key={level} value={level}>
                              {reminderLevelLabels[level]}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field label="Poznámka (volitelné)">
                        <TextInput name="note" />
                      </Field>
                    </div>
                    <div>
                      <Button type="submit" variant="secondary">
                        Zaznamenat upomínku
                      </Button>
                    </div>
                  </form>
                </Section>
              ) : null}

              <Section title="Storno faktury">
              <form action={cancelInvoice} className="grid max-w-md gap-3">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <Field label="Důvod storna (volitelné)">
                  <TextArea name="cancelReason" />
                </Field>
                <div>
                  <Button type="submit" variant="danger">
                    Stornovat fakturu
                  </Button>
                </div>
              </form>
              </Section>
            </>
          ) : null}

          {isCancelled ? (
            <Section title="Storno">
              <p className="text-sm text-stone-600">
                Faktura byla stornována{" "}
                {invoice.cancelledAt ? `dne ${formatDate(invoice.cancelledAt)}` : ""}
                {invoice.cancelReason ? ` — ${invoice.cancelReason}` : ""}.
              </p>
            </Section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
