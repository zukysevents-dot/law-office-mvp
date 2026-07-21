import { ReportView } from "@/components/report-view";
import { canViewAllLegalData } from "@/lib/permissions";
import { bySubject } from "@/lib/reporting/aggregations";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// #12 WIP ("rozpracovanost") — billable work already logged but not yet on any
// invoice, grouped by client. Gated to ADMIN/PARTNER like the financial reports.
export default function WipReportPage({ searchParams }: PageProps) {
  return (
    <ReportView
      title="Rozpracovanost (WIP)"
      description="Fakturovatelná práce, která ještě není na žádné faktuře, podle klienta."
      labelHeader="Klient"
      aggregate={bySubject}
      searchParams={searchParams}
      canView={canViewAllLegalData}
      deniedMessage="Přehled rozpracovanosti mohou zobrazit jen ADMIN a PARTNER."
      extraWhere={{ invoiceId: null, billingStatus: "BILLABLE", archivedAt: null }}
    />
  );
}
