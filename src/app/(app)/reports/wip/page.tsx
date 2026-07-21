import { ReportView } from "@/components/report-view";
import { invoiceableWorkLogWhere } from "@/lib/billing";
import { canViewAllLegalData } from "@/lib/permissions";
import { bySubject } from "@/lib/reporting/aggregations";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// WIP ("rozpracovanost") — billable work already logged and approved but not yet
// on any invoice, grouped by client. Reuses the shared billing basis so it can
// never diverge from what /billing considers invoiceable. Gated to ADMIN/PARTNER
// like the other financial reports.
export default function WipReportPage({ searchParams }: PageProps) {
  return (
    <ReportView
      title="Rozpracovanost (WIP)"
      description="Fakturovatelná a schválená práce, která ještě není na žádné faktuře, podle klienta."
      labelHeader="Klient"
      aggregate={bySubject}
      searchParams={searchParams}
      canView={canViewAllLegalData}
      deniedMessage="Přehled rozpracovanosti mohou zobrazit jen ADMIN a PARTNER."
      extraWhere={invoiceableWorkLogWhere}
    />
  );
}
