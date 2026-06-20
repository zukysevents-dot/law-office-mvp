import { ReportView } from "@/components/report-view";
import { byLegalArea } from "@/lib/reporting/aggregations";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ByLegalAreaReportPage({ searchParams }: PageProps) {
  return (
    <ReportView
      title="Reporting podle právních oblastí"
      description="Odpracované hodiny a částky z viditelných výkazů práce podle právní oblasti."
      labelHeader="Právní oblast"
      aggregate={byLegalArea}
      searchParams={searchParams}
    />
  );
}
