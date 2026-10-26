import { ApprovalQueuePage } from "@/components/billing/approval-queue-page";

export const dynamic = "force-dynamic";

type WorkLogApprovalsProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Výkazy práce → Ke schválení. Approvers without access to the invoicing
// pages (e.g. a lawyer assigned as a client's billing approver) reach the
// queue from here; the content is shared with /billing/approvals.
export default async function WorkLogApprovalsPage({
  searchParams,
}: WorkLogApprovalsProps) {
  return (
    <ApprovalQueuePage
      basePath="/work-logs/approvals"
      moduleKey="module.workLogs"
      moduleTitle="Výkazy práce"
      backHref="/work-logs"
      backLabel="Zpět na výkazy"
      params={await searchParams}
    />
  );
}
