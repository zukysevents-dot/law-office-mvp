import { ApprovalQueuePage } from "@/components/billing/approval-queue-page";

export const dynamic = "force-dynamic";

type BillingApprovalsProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Fakturace → Ke schválení. Same queue as Výkazy práce → Ke schválení
// (/work-logs/approvals); only the way back differs.
export default async function BillingApprovalsPage({
  searchParams,
}: BillingApprovalsProps) {
  return (
    <ApprovalQueuePage
      basePath="/billing/approvals"
      moduleKey="module.billing"
      moduleTitle="Fakturace"
      backHref="/billing"
      backLabel="Zpět na fakturaci"
      params={await searchParams}
    />
  );
}
