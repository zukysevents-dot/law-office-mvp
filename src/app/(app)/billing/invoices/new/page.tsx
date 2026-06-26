import { createInvoiceFromWorkLogs } from "@/app/actions/invoices";
import { Field, SelectInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import {
  billingWorkLogInclude,
  invoiceableWorkLogWhere,
  type BillingWorkLog,
} from "@/lib/billing";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  formatCaseLabel,
  formatDateUtc,
  formatHours,
  formatMoney,
} from "@/lib/format";
import {
  andWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { firstParam } from "@/lib/search-params";

export const dynamic = "force-dynamic";

type NewInvoiceData = {
  subjects: Array<{ id: string; name: string }>;
  workLogs: BillingWorkLog[];
  selectedSubjectId: string;
};

type NewInvoiceProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewInvoicePage({ searchParams }: NewInvoiceProps) {
  const params = await searchParams;
  const selectedSubjectId = firstParam(params, "subjectId") ?? "";

  const result = await safeQuery<NewInvoiceData>(
    { subjects: [], workLogs: [], selectedSubjectId },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.BILLING);

      const subjects = await prisma.subject.findMany({
        where: {
          organizationId: currentUser.organizationId,
          workLogs: { some: invoiceableWorkLogWhere },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        take: 500,
      });

      const workLogs = selectedSubjectId
        ? await prisma.workLog.findMany({
            where: andWhere(
              invoiceableWorkLogWhere,
              workLogVisibilityWhere(currentUser),
              { subjectId: selectedSubjectId },
            ),
            orderBy: [{ workDate: "asc" }],
            include: billingWorkLogInclude,
            take: 1000,
          })
        : [];

      return { subjects, workLogs, selectedSubjectId };
    },
  );

  const data = result.data ?? {
    subjects: [],
    workLogs: [],
    selectedSubjectId,
  };

  return (
    <>
      <PageHeader
        title="Nová faktura"
        description="Vyberte klienta a schválené výkazy, ze kterých vznikne rozpracovaná faktura."
        action={
          <ButtonLink href="/billing/invoices" variant="secondary">
            Zpět na faktury
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <Section title="Klient">
        {data.subjects.length > 0 ? (
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Klient s nevyfakturovanými výkazy" className="min-w-64">
              <SelectInput name="subjectId" defaultValue={data.selectedSubjectId}>
                <option value="">— vyberte klienta —</option>
                {data.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Button type="submit" variant="secondary">
              Načíst výkazy
            </Button>
          </form>
        ) : (
          <EmptyState>
            Žádný klient nemá schválené nevyfakturované výkazy.
          </EmptyState>
        )}
      </Section>

      {data.selectedSubjectId ? (
        <Section title="Výkazy k fakturaci">
          {data.workLogs.length > 0 ? (
            <form action={createInvoiceFromWorkLogs} className="grid gap-4">
              <input
                type="hidden"
                name="subjectId"
                value={data.selectedSubjectId}
              />
              <div className="table-scroll">
                <table className="w-max min-w-full">
                  <thead>
                    <tr>
                      <th>Fakturovat</th>
                      <th>Datum</th>
                      <th>Případ</th>
                      <th>Pracovník</th>
                      <th className="text-right">Hodiny</th>
                      <th className="text-right">Částka</th>
                      <th>Popis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workLogs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <input
                            type="checkbox"
                            name="workLogId"
                            value={log.id}
                            defaultChecked
                            aria-label="Zahrnout výkaz do faktury"
                            className="h-4 w-4 rounded border-[#cfe0d7] text-[#072924] focus:ring-[#B9DCC6]"
                          />
                        </td>
                        <td>{formatDateUtc(log.workDate)}</td>
                        <td>{formatCaseLabel(log.case, "—")}</td>
                        <td>{log.user?.name ?? "—"}</td>
                        <td className="text-right">{formatHours(log.hours)}</td>
                        <td className="text-right">{formatMoney(log.amountCzk)}</td>
                        <td>{log.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <Button type="submit">Vytvořit rozpracovanou fakturu</Button>
              </div>
            </form>
          ) : (
            <EmptyState>
              Tento klient nemá žádné schválené nevyfakturované výkazy.
            </EmptyState>
          )}
        </Section>
      ) : null}
    </>
  );
}
