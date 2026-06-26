import {
  archiveRetainer,
  createRetainer,
  generateRetainerInvoice,
} from "@/app/actions/retainers";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  RetainerAgreement,
  Subject,
} from "@/generated/prisma/client";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import { canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RetainerRow = RetainerAgreement & { subject: { name: string } };

type RetainersData = {
  allowed: boolean;
  retainers: RetainerRow[];
  subjects: Pick<Subject, "id" | "name">[];
};

export default async function RetainersPage() {
  const result = await safeQuery<RetainersData>(
    { allowed: false, retainers: [], subjects: [] },
    async () => {
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.BILLING);
      const allowed =
        canViewAllLegalData(currentUser) || currentUser.role === "LAWYER";
      if (!allowed) {
        return { allowed: false, retainers: [], subjects: [] };
      }
      const prisma = getPrisma();
      const [retainers, subjects] = await Promise.all([
        prisma.retainerAgreement.findMany({
          where: { organizationId: currentUser.organizationId },
          include: { subject: { select: { name: true } } },
          orderBy: [{ active: "desc" }, { createdAt: "desc" }],
          take: 500,
        }),
        prisma.subject.findMany({
          where: { organizationId: currentUser.organizationId, archivedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        }),
      ]);
      return { allowed: true, retainers, subjects };
    },
  );

  const data = result.data ?? { allowed: false, retainers: [], subjects: [] };

  return (
    <>
      <PageHeader
        title="Paušály"
        description="Paušální smlouvy klientů a generování pravidelných faktur."
        action={
          <ButtonLink href="/billing/invoices" variant="secondary">
            Faktury
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {result.databaseReady && !data.allowed ? (
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            Paušály mohou spravovat advokáti, partneři a administrátoři.
          </p>
        </Section>
      ) : null}

      {data.allowed ? (
        <>
          <Section title="Přehled paušálů">
            {data.retainers.length > 0 ? (
              <div className="table-scroll">
                <table className="w-max min-w-full">
                  <thead>
                    <tr>
                      <th>Klient</th>
                      <th className="text-right">Měsíční paušál</th>
                      <th className="text-right">Hodin v ceně</th>
                      <th>Platnost</th>
                      <th>Stav</th>
                      <th>Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.retainers.map((retainer) => (
                      <tr key={retainer.id}>
                        <td className="font-medium text-stone-950">
                          {retainer.subject.name}
                        </td>
                        <td className="text-right">
                          {formatMoney(retainer.monthlyFeeCzk)}
                        </td>
                        <td className="text-right">
                          {retainer.includedHours
                            ? formatHours(retainer.includedHours)
                            : "—"}
                        </td>
                        <td>
                          {formatDate(retainer.startDate)}
                          {retainer.endDate
                            ? ` – ${formatDate(retainer.endDate)}`
                            : ""}
                        </td>
                        <td>
                          <Badge tone={retainer.active ? "green" : "neutral"}>
                            {retainer.active ? "Aktivní" : "Ukončený"}
                          </Badge>
                        </td>
                        <td>
                          {retainer.active ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <form
                                action={generateRetainerInvoice}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="hidden"
                                  name="retainerId"
                                  value={retainer.id}
                                />
                                <TextInput
                                  type="month"
                                  name="period"
                                  aria-label="Období"
                                  className="h-9 w-36"
                                />
                                <Button
                                  type="submit"
                                  variant="ghost"
                                  className="h-9 px-3"
                                >
                                  Vystavit fakturu
                                </Button>
                              </form>
                              <form action={archiveRetainer}>
                                <input
                                  type="hidden"
                                  name="retainerId"
                                  value={retainer.id}
                                />
                                <Button
                                  type="submit"
                                  variant="danger"
                                  className="h-9 px-3"
                                >
                                  Ukončit
                                </Button>
                              </form>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Zatím nebyl založen žádný paušál.</EmptyState>
            )}
          </Section>

          <Section title="Nový paušál">
            {data.subjects.length > 0 ? (
              <form action={createRetainer} className="grid gap-4 sm:max-w-2xl">
                <Field label="Klient">
                  <SelectInput name="subjectId" required>
                    {data.subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Měsíční paušál (Kč)">
                    <TextInput
                      name="monthlyFeeCzk"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                    />
                  </Field>
                  <Field label="Hodin v ceně (volitelné)">
                    <TextInput name="includedHours" type="number" step="0.5" min="0" />
                  </Field>
                  <Field label="Sazba DPH (%)">
                    <TextInput
                      name="vatRate"
                      type="number"
                      step="1"
                      min="0"
                      defaultValue="21"
                    />
                  </Field>
                  <Field label="Platnost od">
                    <TextInput name="startDate" type="date" />
                  </Field>
                  <Field label="Platnost do (volitelné)">
                    <TextInput name="endDate" type="date" />
                  </Field>
                </div>
                <Field label="Poznámka (volitelné)">
                  <TextArea name="note" />
                </Field>
                <div>
                  <Button type="submit">Vytvořit paušál</Button>
                </div>
              </form>
            ) : (
              <EmptyState>
                Nejprve založte klienta (Subjekt), kterému lze nastavit paušál.
              </EmptyState>
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}
