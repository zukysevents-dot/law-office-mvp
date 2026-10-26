import { AccessDenied } from "@/components/access-denied";
import { ApprovalQueue } from "@/components/billing/approval-queue";
import { CascadingMatterSelect } from "@/components/cascading-matter-select";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import {
  APPROVAL_QUERY_MAX,
  hasApprovalFilters,
  readApprovalFilters,
} from "@/lib/billing-approvals";
import {
  loadApprovalQueue,
  type ApprovalQueueData,
} from "@/lib/billing-approvals.server";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled, isModuleEnabled } from "@/lib/entitlements";
import {
  canAccessModule,
  moduleAccessDenial,
} from "@/lib/module-access.server";
import type { ModulePermissionKey } from "@/lib/permission-catalog";
import { canApproveWorkLogs, canManageInvoices } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  filterFormKey,
  firstParam,
  type SearchParamValue,
} from "@/lib/search-params";

const emptyQueue: ApprovalQueueData = {
  rows: [],
  totals: { count: 0, hours: 0 },
  capped: false,
  access: { canApproveAll: false, canApprove: false },
  showRates: false,
  users: [],
  options: { subjects: [], projects: [], cases: [], users: [] },
};

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

// Schvalování nepatří jen sekci Fakturace: frontu otevře i ten, kdo má funkci
// „Schvaluje výkazy celé kanceláře“ nebo je schvalovatelem u některého klienta
// (kterýkoli člen kanceláře, i koncipient bez sekce Fakturace). Modul kanceláře
// (entitlement) musí být aktivní vždy — stejně jako v decideWorkLog.
async function approvalsAccessDenial(
  user: CurrentUser,
  moduleKey: ModulePermissionKey,
): Promise<string | null> {
  const denial = await moduleAccessDenial(user, moduleKey);
  if (!denial) {
    return null;
  }
  // Neaktivní modul kanceláře nepřebije ani přiřazení schvalovatelem.
  if (!(await isModuleEnabled(user.organizationId, ModuleKey.BILLING))) {
    return denial;
  }
  if (canApproveWorkLogs(user)) {
    return null;
  }
  const assignments = await getPrisma().subjectBillingApprover.count({
    where: { organizationId: user.organizationId, userId: user.id },
  });
  return assignments > 0 ? null : denial;
}

/**
 * Shared content of both entry points to the approval queue —
 * Fakturace → Ke schválení (/billing/approvals) and Výkazy práce → Ke schválení
 * (/work-logs/approvals) — so the two never drift apart. Filters live in the
 * URL (GET form); decisions go through the billing server actions.
 */
export async function ApprovalQueuePage({
  basePath,
  moduleKey,
  moduleTitle,
  backHref,
  backLabel,
  params,
}: {
  basePath: string;
  /** Section the entry point belongs to (module.billing / module.workLogs). */
  moduleKey: ModulePermissionKey;
  moduleTitle: string;
  backHref: string;
  backLabel: string;
  params: Record<string, SearchParamValue>;
}) {
  const accessUser = await getCurrentUser();
  const accessDenied = await approvalsAccessDenial(accessUser, moduleKey);
  if (accessDenied) {
    return <AccessDenied title={moduleTitle} message={accessDenied} />;
  }
  // Zpět na fakturaci jen tomu, kdo ji smí otevřít; jinak na výkazy práce.
  const back =
    backHref === "/billing" &&
    !(
      (await canAccessModule(accessUser, "module.billing")) &&
      canManageInvoices(accessUser)
    )
      ? { href: "/work-logs", label: "Zpět na výkazy práce" }
      : { href: backHref, label: backLabel };

  const filters = readApprovalFilters((key) => firstParam(params, key));
  const result = await safeQuery<ApprovalQueueData>(emptyQueue, async () => {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();
    // Decisions are part of the billing basis and the actions require it.
    await assertModuleEnabled(currentUser, ModuleKey.BILLING);
    return loadApprovalQueue(prisma, currentUser, filters);
  });
  const data = result.data;
  const filtered = hasApprovalFilters(filters);

  return (
    <>
      <PageHeader
        title="Položky ke schválení"
        description="Výkazy práce čekající na schválení do fakturačních podkladů. Vyfiltrujte klienta, zkontrolujte popis úkonu a rozhodněte jednotlivě nebo hromadně."
        action={
          <ButtonLink href={back.href} variant="secondary">
            {back.label}
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <Section title="Filtry">
        <form
          key={filterFormKey(params)}
          method="get"
          action={basePath}
          className="grid gap-4"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {/* Nabízí jen klienty / projekty / případy, které ve frontě mají
                položky; kaskáda jako všude jinde. */}
            <CascadingMatterSelect
              subjects={data.options.subjects}
              projects={data.options.projects}
              cases={data.options.cases}
              defaultSubjectId={filters.subjectId}
              defaultProjectId={filters.projectId}
              defaultCaseId={filters.caseId}
              filterMode
            />
            <Field label="Pracovník">
              <SelectInput name="userId" defaultValue={filters.userId}>
                <option value="">Všichni pracovníci</option>
                {data.options.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Datum od">
              <TextInput name="dateFrom" type="date" defaultValue={filters.dateFrom} />
            </Field>
            <Field label="Datum do">
              <TextInput name="dateTo" type="date" defaultValue={filters.dateTo} />
            </Field>
            <Field label="Fakturovatelnost">
              <SelectInput name="billable" defaultValue={filters.billable}>
                <option value="">Vše</option>
                <option value="BILLABLE">Fakturovatelné</option>
                <option value="WRITE_OFF">Odpis</option>
              </SelectInput>
            </Field>
            <Field label="Popis obsahuje">
              <TextInput
                name="q"
                type="search"
                maxLength={APPROVAL_QUERY_MAX}
                defaultValue={filters.q}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary">
              Filtrovat
            </Button>
            {filtered ? (
              <ButtonLink href={basePath} variant="ghost">
                Zrušit filtry
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </Section>
      <Section title="Ke schválení">
        <ApprovalQueue
          rows={data.rows}
          users={data.users}
          canApprove={data.access.canApprove}
          showRates={data.showRates}
          totals={data.totals}
          capped={data.capped}
        />
      </Section>
    </>
  );
}
