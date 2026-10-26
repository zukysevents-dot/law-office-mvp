import { decideWorkLog } from "@/app/actions/billing";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled, isModuleEnabled } from "@/lib/entitlements";
import {
  BILLING_ROW_LIMIT,
  billingWorkLogInclude,
  pendingApprovalWorkLogWhere,
  type BillingWorkLog,
} from "@/lib/billing";
import { safeQuery } from "@/lib/db-safe";
import { numberInputValue } from "@/lib/form-values";
import { getOrgUserOptions } from "@/lib/org-users";
import { formatCaseLabel, formatDateUtc } from "@/lib/format";
import { approvalStatusLabels, billingStatusLabels } from "@/lib/labels";
import { getPrisma } from "@/lib/prisma";
import {
  andWhere,
  billingApproverWorkLogWhere,
  canApproveWorkLogs,
  canManageInvoices,
  canViewRates,
} from "@/lib/permissions";
import { approvalStatusTone, billingStatusTone } from "@/lib/status-tones";
import { AccessDenied } from "@/components/access-denied";
import {
  canAccessModule,
  moduleAccessDenial,
} from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

type ApprovalsPageData = {
  rows: BillingWorkLog[];
  users: Array<{ id: string; name: string }>;
  capped: boolean;
  canApprove: boolean;
  canViewRates: boolean;
};

// Schvalování nepatří jen sekci Fakturace: stránku otevře i ten, kdo má funkci
// „Schvaluje výkazy celé kanceláře“ nebo je schvalovatelem u některého klienta
// (kterýkoli člen kanceláře, i koncipient bez sekce Fakturace). Modul kanceláře
// (entitlement) musí být aktivní vždy — stejně jako v decideWorkLog.
async function approvalsAccessDenial(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
): Promise<string | null> {
  const denial = await moduleAccessDenial(user, "module.billing");
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

export default async function BillingApprovalsPage() {
  const accessUser = await getCurrentUser();
  const accessDenied = await approvalsAccessDenial(accessUser);
  if (accessDenied) {
    return <AccessDenied title="Fakturace" message={accessDenied} />;
  }
  const backHref = (await canAccessModule(accessUser, "module.billing")) &&
    canManageInvoices(accessUser)
    ? { href: "/billing", label: "Zpět na fakturaci" }
    : { href: "/work-logs", label: "Zpět na výkazy práce" };

  const result = await safeQuery<ApprovalsPageData>(
    { rows: [], users: [], capped: false, canApprove: false, canViewRates: false },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.BILLING);
      const canApproveAll = canApproveWorkLogs(currentUser);
      const approvalAssignmentCount = canApproveAll
        ? 0
        : await prisma.subjectBillingApprover.count({
            where: {
              organizationId: currentUser.organizationId,
              userId: currentUser.id,
            },
          });
      const canApprove = canApproveAll || approvalAssignmentCount > 0;
      const [rows, users] = await Promise.all([
        prisma.workLog.findMany({
          where: andWhere(
            pendingApprovalWorkLogWhere,
            { organizationId: currentUser.organizationId },
            canApproveAll
              ? undefined
              : billingApproverWorkLogWhere(currentUser.id),
          ),
          orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
          include: billingWorkLogInclude,
          take: BILLING_ROW_LIMIT,
        }),
        getOrgUserOptions(currentUser),
      ]);

      return {
        rows,
        users,
        capped: rows.length >= BILLING_ROW_LIMIT,
        canApprove,
        canViewRates: canViewRates(currentUser),
      };
    },
  );

  return (
    <>
      <PageHeader
        title="Položky ke schválení"
        description={
          result.data.canViewRates
            ? "Výkazy práce čekající na schválení do fakturačních podkladů. Lze upravit popis, pracovníka, hodiny i sazbu a rozhodnout."
            : "Výkazy práce čekající na schválení do fakturačních podkladů. Lze upravit popis, pracovníka i hodiny a rozhodnout."
        }
        action={
          <ButtonLink href={backHref.href} variant="secondary">
            {backHref.label}
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <Section title="Ke schválení">
        {result.data.capped ? (
          <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Zobrazeno prvních {BILLING_ROW_LIMIT} položek. Rozhodněte je a zužte
            filtr pro zobrazení dalších.
          </p>
        ) : null}
        {result.data.rows.length > 0 ? (
          <div className="grid gap-4">
            {result.data.rows.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-[#dce4e8] bg-white p-4 shadow-sm shadow-[#0e1822]/5"
              >
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#566673]">
                  <span className="font-medium text-[#0e1822]">
                    {formatDateUtc(row.workDate)}
                  </span>
                  <span>{row.subject?.name ?? "—"}</span>
                  <span>{row.project?.name ?? "—"}</span>
                  <span>{formatCaseLabel(row.case)}</span>
                  <Badge tone={billingStatusTone(row.billingStatus)}>
                    {billingStatusLabels[row.billingStatus]}
                  </Badge>
                  <Badge tone={approvalStatusTone(row.approvalStatus)}>
                    {approvalStatusLabels[row.approvalStatus]}
                  </Badge>
                </div>
                {result.data.canApprove ? (
                  <form action={decideWorkLog} className="grid gap-4">
                    <input type="hidden" name="id" value={row.id} />
                    <div className="grid gap-4 md:grid-cols-4">
                      <Field label="Pracovník">
                        <SelectInput
                          name="userId"
                          defaultValue={row.userId ?? ""}
                        >
                          <option value="">Bez pracovníka</option>
                          {result.data.users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field label="Hodiny">
                        <TextInput
                          name="hours"
                          type="number"
                          min="0"
                          step="0.25"
                          defaultValue={numberInputValue(row.hours)}
                          required
                        />
                      </Field>
                      {result.data.canViewRates ? (
                        <Field label="Sazba">
                          <TextInput
                            name="hourlyRate"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={numberInputValue(row.hourlyRate)}
                          />
                        </Field>
                      ) : null}
                      <Field label="Popis">
                        <TextInput
                          name="description"
                          defaultValue={row.description ?? ""}
                        />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        name="disposition"
                        value="APPROVE"
                        className="h-9 px-3"
                      >
                        Schválit
                      </Button>
                      <Button
                        type="submit"
                        name="disposition"
                        value="VISIBLE_WRITE_OFF"
                        variant="secondary"
                        className="h-9 px-3"
                      >
                        Viditelný odpis (0 Kč)
                      </Button>
                      <Button
                        type="submit"
                        name="disposition"
                        value="HIDDEN_WRITE_OFF"
                        variant="secondary"
                        className="h-9 px-3"
                      >
                        Skrytý odpis
                      </Button>
                      <Button
                        type="submit"
                        name="disposition"
                        value="REJECT"
                        variant="danger"
                        className="h-9 px-3"
                      >
                        Zamítnout
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="text-sm text-black/60">
                    Nemáte oprávnění schvalovat položky.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>Žádné položky nečekají na schválení.</EmptyState>
        )}
      </Section>
    </>
  );
}
