import { approveWorkLog, rejectWorkLog } from "@/app/actions/billing";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import {
  BILLING_ROW_LIMIT,
  billingWorkLogInclude,
  pendingApprovalWorkLogWhere,
  type BillingWorkLog,
} from "@/lib/billing";
import { safeQuery } from "@/lib/db-safe";
import {
  formatCaseLabel,
  formatDateUtc,
  formatHours,
  formatMoney,
} from "@/lib/format";
import { approvalStatusLabels, billingStatusLabels } from "@/lib/labels";
import { getPrisma } from "@/lib/prisma";
import {
  andWhere,
  canViewAllLegalData,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { approvalStatusTone, billingStatusTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type ApprovalsPageData = {
  rows: BillingWorkLog[];
  capped: boolean;
  canApprove: boolean;
};

export default async function BillingApprovalsPage() {
  const result = await safeQuery<ApprovalsPageData>(
    { rows: [], capped: false, canApprove: false },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const rows = await prisma.workLog.findMany({
        where: andWhere(
          pendingApprovalWorkLogWhere,
          workLogVisibilityWhere(currentUser),
        ),
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        include: billingWorkLogInclude,
        take: BILLING_ROW_LIMIT,
      });

      return {
        rows,
        capped: rows.length >= BILLING_ROW_LIMIT,
        canApprove: canViewAllLegalData(currentUser),
      };
    },
  );

  return (
    <>
      <PageHeader
        title="Položky ke schválení"
        description="Výkazy práce čekající na schválení do fakturačních podkladů."
        action={
          <ButtonLink href="/billing" variant="secondary">
            Zpět na fakturaci
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <Section title="Ke schválení">
        {result.data.capped ? (
          <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Zobrazeno prvních {BILLING_ROW_LIMIT} položek. Schvalte je a zužte
            filtr pro zobrazení dalších.
          </p>
        ) : null}
        {result.data.rows.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Klient</th>
                  <th>Projekt</th>
                  <th>Případ</th>
                  <th>Pracovník</th>
                  <th>Hodiny</th>
                  <th>Sazba</th>
                  <th>Částka</th>
                  <th>Billing status</th>
                  <th>Stav schválení</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {result.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateUtc(row.workDate)}</td>
                    <td>{row.subject?.name ?? "—"}</td>
                    <td>{row.project?.name ?? "—"}</td>
                    <td>{formatCaseLabel(row.case)}</td>
                    <td>{row.user?.name ?? "—"}</td>
                    <td>{formatHours(row.hours)}</td>
                    <td>{formatMoney(row.hourlyRate)}</td>
                    <td>{formatMoney(row.amountCzk)}</td>
                    <td>
                      <Badge tone={billingStatusTone(row.billingStatus)}>
                        {billingStatusLabels[row.billingStatus]}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={approvalStatusTone(row.approvalStatus)}>
                        {approvalStatusLabels[row.approvalStatus]}
                      </Badge>
                    </td>
                    <td>
                      {result.data.canApprove ? (
                        <div className="flex flex-wrap gap-2">
                          <form action={approveWorkLog}>
                            <input type="hidden" name="id" value={row.id} />
                            <Button type="submit" className="h-8 px-3">
                              Schválit
                            </Button>
                          </form>
                          <form action={rejectWorkLog}>
                            <input type="hidden" name="id" value={row.id} />
                            <Button
                              type="submit"
                              variant="danger"
                              className="h-8 px-3"
                            >
                              Zamítnout
                            </Button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-sm text-black/50">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Žádné položky nečekají na schválení.</EmptyState>
        )}
      </Section>
    </>
  );
}
