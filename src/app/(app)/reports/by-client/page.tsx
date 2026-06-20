import { ReportView } from "@/components/report-view";
import { bySubject } from "@/lib/reporting/aggregations";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ByClientReportPage({ searchParams }: PageProps) {
  return (
    <ReportView
      title="Reporting podle klientů"
      description="Odpracované hodiny a částky z viditelných výkazů práce podle klienta."
      labelHeader="Klient"
      aggregate={bySubject}
      searchParams={searchParams}
    />
  );
}
