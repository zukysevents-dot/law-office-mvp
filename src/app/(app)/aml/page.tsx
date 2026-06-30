import { Field, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDate } from "@/lib/format";
import { amlRiskLevelLabels } from "@/lib/labels";
import { canManageAml } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { amlRiskLevelTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

const REVIEW_WINDOW_DAYS = 30;

// Wrapped in a module function so the impure clock call stays out of the
// component render body (react-hooks/purity).
function reviewDueBoundary(): Date {
  return new Date(Date.now() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

const assessmentInclude = {
  subject: { select: { id: true, name: true } },
} satisfies Prisma.AmlAssessmentInclude;

type AssessmentRow = Prisma.AmlAssessmentGetPayload<{
  include: typeof assessmentInclude;
}>;

type SubjectHit = { id: string; name: string; ico: string | null };

type Data = {
  allowed: boolean;
  risky: AssessmentRow[];
  dueSoon: AssessmentRow[];
  query: string;
  searchResults: SubjectHit[];
};

export default async function AmlPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 100);

  const result = await safeQuery<Data>(
    { allowed: false, risky: [], dueSoon: [], query, searchResults: [] },
    async () => {
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.AML);
      if (!canManageAml(currentUser)) {
        return {
          allowed: false,
          risky: [],
          dueSoon: [],
          query,
          searchResults: [],
        };
      }
      const organizationId = currentUser.organizationId;
      // Fail-closed: admin/partner bez aktivní org nesmí spustit žádný dotaz.
      if (!organizationId) {
        return {
          allowed: false,
          risky: [],
          dueSoon: [],
          query,
          searchResults: [],
        };
      }
      const prisma = getPrisma();
      const dueBoundary = reviewDueBoundary();
      // „Nová kontrola / identifikace": vyhledej zapsaný subjekt dle jména/IČO.
      const searchResults = query
        ? await prisma.subject.findMany({
            where: {
              organizationId,
              archivedAt: null,
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { ico: { contains: query } },
              ],
            },
            orderBy: { name: "asc" },
            take: 20,
            select: { id: true, name: true, ico: true },
          })
        : [];
      const [risky, dueSoon] = await Promise.all([
        prisma.amlAssessment.findMany({
          where: {
            organizationId,
            OR: [{ riskLevel: "HIGH" }, { isPep: true }, { hasSanctions: true }],
          },
          include: assessmentInclude,
          orderBy: { reviewDueAt: "asc" },
          take: 500,
        }),
        prisma.amlAssessment.findMany({
          where: { organizationId, reviewDueAt: { lte: dueBoundary } },
          include: assessmentInclude,
          orderBy: { reviewDueAt: "asc" },
          take: 500,
        }),
      ]);
      return { allowed: true, risky, dueSoon, query, searchResults };
    },
  );

  const data = result.data ?? {
    allowed: false,
    risky: [],
    dueSoon: [],
    query,
    searchResults: [],
  };

  return (
    <>
      <PageHeader
        title="AML / KYC"
        description="Rizikoví klienti a blížící se revize hodnocení."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {result.databaseReady && !data.allowed ? (
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            AML/KYC údaje jsou dostupné pouze partnerům a administrátorům.
          </p>
        </Section>
      ) : null}

      {data.allowed ? (
        <>
          <Section title="Nová kontrola / identifikace">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <Field label="Vyhledat klienta (jméno nebo IČO)">
                <TextInput
                  name="q"
                  defaultValue={data.query}
                  placeholder="Jméno nebo IČO…"
                />
              </Field>
              <Button type="submit" variant="secondary">
                Vyhledat
              </Button>
            </form>
            {data.query ? (
              data.searchResults.length > 0 ? (
                <ul className="mt-4 grid gap-2">
                  {data.searchResults.map((hit) => (
                    <li
                      key={hit.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#d4e2dc] bg-[#EEF5F1]/55 px-3 py-2"
                    >
                      <span className="font-medium text-[#072924]">
                        {hit.name}
                        {hit.ico ? `, IČO ${hit.ico}` : ""}
                      </span>
                      <a
                        href={`/subjects/${hit.id}#aml`}
                        className="text-emerald-800 underline"
                      >
                        Nový zápis AML →
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  Pro „{data.query}“ nebyl nalezen žádný subjekt.{" "}
                  <a
                    href={`/subjects?q=${encodeURIComponent(data.query)}#new-subject`}
                    className="font-medium underline"
                  >
                    Založit nový subjekt
                  </a>
                </div>
              )
            ) : (
              <p className="mt-3 text-sm text-stone-500">
                Zadejte jméno nebo IČO klienta a otevřete jeho AML identifikaci /
                kontrolu.
              </p>
            )}
          </Section>

          <Section title="Rizikoví klienti (vysoké riziko / PEP / sankce)">
            {data.risky.length > 0 ? (
              <div className="table-scroll">
                <table className="w-max min-w-full">
                  <thead>
                    <tr>
                      <th>Klient</th>
                      <th>Riziko</th>
                      <th>PEP</th>
                      <th>Sankce</th>
                      <th>Revize do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.risky.map((assessment) => (
                      <tr key={assessment.id}>
                        <td className="font-medium text-stone-950">
                          <a
                            href={`/subjects/${assessment.subject.id}`}
                            className="text-[#072924] underline-offset-2 hover:underline"
                          >
                            {assessment.subject.name}
                          </a>
                        </td>
                        <td>
                          <Badge tone={amlRiskLevelTone(assessment.riskLevel)}>
                            {amlRiskLevelLabels[assessment.riskLevel]}
                          </Badge>
                        </td>
                        <td>{assessment.isPep ? "Ano" : "—"}</td>
                        <td>{assessment.hasSanctions ? "Shoda" : "—"}</td>
                        <td>{formatDate(assessment.reviewDueAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Žádní rizikoví klienti.</EmptyState>
            )}
          </Section>

          <Section title={`Revize splatné do ${REVIEW_WINDOW_DAYS} dní`}>
            {data.dueSoon.length > 0 ? (
              <div className="table-scroll">
                <table className="w-max min-w-full">
                  <thead>
                    <tr>
                      <th>Klient</th>
                      <th>Riziko</th>
                      <th>Revize do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dueSoon.map((assessment) => (
                      <tr key={assessment.id}>
                        <td className="font-medium text-stone-950">
                          <a
                            href={`/subjects/${assessment.subject.id}`}
                            className="text-[#072924] underline-offset-2 hover:underline"
                          >
                            {assessment.subject.name}
                          </a>
                        </td>
                        <td>
                          <Badge tone={amlRiskLevelTone(assessment.riskLevel)}>
                            {amlRiskLevelLabels[assessment.riskLevel]}
                          </Badge>
                        </td>
                        <td>{formatDate(assessment.reviewDueAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Žádné revize v nejbližších dnech.</EmptyState>
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}
