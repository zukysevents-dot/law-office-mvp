import { createInvoiceFromWorkLogs } from "@/app/actions/invoices";
import { CascadingMatterSelect } from "@/components/cascading-matter-select";
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
import { normalizeInvoiceMatter } from "@/lib/invoices";
import {
  andWhere,
  canManageInvoices,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { firstParam } from "@/lib/search-params";
import { AccessDenied } from "@/components/access-denied";
import { moduleAccessDenial } from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

type NewInvoiceData = {
  allowed: boolean;
  subjects: Array<{ id: string; name: string; ico: string | null }>;
  projects: Array<{ id: string; name: string; mainSubjectId: string }>;
  cases: Array<{
    id: string;
    name: string;
    projectId: string;
    project: { name: string; mainSubjectId: string };
  }>;
  workLogs: BillingWorkLog[];
  selectedSubjectId: string;
  selectedProjectId: string;
  selectedCaseId: string;
  issuers: Array<{ id: string; legalName: string }>;
  defaultIssuerName: string;
};

type NewInvoiceProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewInvoicePage({ searchParams }: NewInvoiceProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.billing");
  if (accessDenied) {
    return <AccessDenied title="Nová faktura" message={accessDenied} />;
  }

  const params = await searchParams;
  const selectedSubjectId = firstParam(params, "subjectId") ?? "";
  const requestedProjectId = firstParam(params, "projectId") ?? "";
  const requestedCaseId = firstParam(params, "caseId") ?? "";

  const emptyData: NewInvoiceData = {
    allowed: false,
    subjects: [],
    projects: [],
    cases: [],
    workLogs: [],
    selectedSubjectId,
    selectedProjectId: "",
    selectedCaseId: "",
    issuers: [],
    defaultIssuerName: "Kancelář",
  };

  const result = await safeQuery<NewInvoiceData>(
    emptyData,
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.BILLING);
      // Bez oprávnění vykreslíme "Přístup odepřen" místo obecné chybové stránky.
      if (!canManageInvoices(currentUser)) {
        return emptyData;
      }

      // Jen klienti/projekty/případy, ke kterým má uživatel viditelné schválené
      // nevyfakturované výkazy — kaskáda pak nabízí jen to, co jde fakturovat.
      const invoiceableVisible = andWhere(
        invoiceableWorkLogWhere,
        workLogVisibilityWhere(currentUser),
      );
      const [subjects, projects, cases, issuers, profile] = await Promise.all([
        prisma.subject.findMany({
          where: {
            organizationId: currentUser.organizationId,
            workLogs: { some: invoiceableVisible },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, ico: true },
          take: 500,
        }),
        prisma.project.findMany({
          where: {
            organizationId: currentUser.organizationId,
            workLogs: { some: invoiceableVisible },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, mainSubjectId: true },
          take: 1000,
        }),
        prisma.case.findMany({
          where: {
            organizationId: currentUser.organizationId,
            workLogs: { some: invoiceableVisible },
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            projectId: true,
            project: { select: { name: true, mainSubjectId: true } },
          },
          take: 1000,
        }),
        prisma.billingIssuer.findMany({
          where: {
            organizationId: currentUser.organizationId,
            archivedAt: null,
          },
          orderBy: { legalName: "asc" },
          select: { id: true, legalName: true },
        }),
        prisma.organizationBillingProfile.findUnique({
          where: { organizationId: currentUser.organizationId },
          select: { legalName: true },
        }),
      ]);

      const matter = normalizeInvoiceMatter(
        {
          subjectId: selectedSubjectId,
          projectId: requestedProjectId,
          caseId: requestedCaseId,
        },
        projects,
        cases.map((legalCase) => ({
          id: legalCase.id,
          projectId: legalCase.projectId,
          mainSubjectId: legalCase.project.mainSubjectId,
        })),
      );

      const workLogs = selectedSubjectId
        ? await prisma.workLog.findMany({
            where: andWhere(
              invoiceableVisible,
              { subjectId: selectedSubjectId },
              matter.projectId ? { projectId: matter.projectId } : undefined,
              matter.caseId ? { caseId: matter.caseId } : undefined,
            ),
            orderBy: [{ workDate: "asc" }],
            include: billingWorkLogInclude,
            take: 1000,
          })
        : [];

      return {
        allowed: true,
        subjects,
        projects,
        cases,
        workLogs,
        selectedSubjectId,
        selectedProjectId: matter.projectId,
        selectedCaseId: matter.caseId,
        issuers,
        defaultIssuerName: profile?.legalName ?? "Kancelář",
      };
    },
  );

  const data = result.data ?? emptyData;

  if (result.databaseReady && !data.allowed) {
    return (
      <>
        <PageHeader
          title="Nová faktura"
          description="Vyberte klienta, případně jeho projekt a případ, a schválené výkazy, ze kterých vznikne rozpracovaná faktura."
        />
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            Faktury spravují jen uživatelé s oprávněním „Spravuje fakturaci“. O přístup požádejte administrátora kanceláře (Nastavení → Oprávnění).
          </p>
        </Section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Nová faktura"
        description="Vyberte klienta, případně jeho projekt a případ, a schválené výkazy, ze kterých vznikne rozpracovaná faktura."
        action={
          <ButtonLink href="/billing/invoices" variant="secondary">
            Zpět na faktury
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <Section title="Klient a spis">
        {data.subjects.length > 0 ? (
          <form method="get" className="grid gap-4">
            {/* Klient → jen jeho projekty → jen jejich případy. Projekt a případ
                jsou volitelné: bez nich se fakturuje za celého klienta. */}
            <CascadingMatterSelect
              subjects={data.subjects.map((subject) => ({
                id: subject.id,
                name: subject.ico
                  ? `${subject.name}, IČO ${subject.ico}`
                  : subject.name,
              }))}
              projects={data.projects}
              cases={data.cases.map((legalCase) => ({
                id: legalCase.id,
                name: legalCase.name,
                projectId: legalCase.projectId,
                projectName: legalCase.project.name,
              }))}
              defaultSubjectId={data.selectedSubjectId}
              defaultProjectId={data.selectedProjectId}
              defaultCaseId={data.selectedCaseId}
              subjectLabel="Klient s nevyfakturovanými výkazy"
              subjectPlaceholder="— vyberte klienta —"
              projectPlaceholder="Všechny projekty klienta"
              casePlaceholder="Všechny případy"
              requireSubject
            />
            <div>
              <Button type="submit" variant="secondary">
                Načíst výkazy
              </Button>
            </div>
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
              <input type="hidden" name="projectId" value={data.selectedProjectId} />
              <input type="hidden" name="caseId" value={data.selectedCaseId} />
              <Field label="Fakturující subjekt" className="max-w-md">
                <SelectInput name="issuerId" defaultValue="">
                  <option value="">{data.defaultIssuerName} (kancelář)</option>
                  {data.issuers.map((issuer) => (
                    <option key={issuer.id} value={issuer.id}>
                      {issuer.legalName}
                    </option>
                  ))}
                </SelectInput>
              </Field>
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
                            className="h-4 w-4 rounded border-[#dce4e8] text-[#0e1822] focus:ring-[#17A2A2]"
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
                <Button type="submit" pendingLabel="Vytvářím…">Vytvořit rozpracovanou fakturu</Button>
              </div>
            </form>
          ) : (
            <EmptyState>
              {data.selectedProjectId || data.selectedCaseId
                ? "Pro zvolený projekt/případ nemá klient žádné schválené nevyfakturované výkazy."
                : "Tento klient nemá žádné schválené nevyfakturované výkazy."}
            </EmptyState>
          )}
        </Section>
      ) : null}
    </>
  );
}
