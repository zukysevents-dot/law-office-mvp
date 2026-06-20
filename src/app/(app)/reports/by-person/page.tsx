import { ReportView } from "@/components/report-view";
import { canViewPersonReports } from "@/lib/permissions";
import { byUser } from "@/lib/reporting/aggregations";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ByPersonReportPage({ searchParams }: PageProps) {
  return (
    <ReportView
      title="Reporting podle lidí"
      description="Odpracované hodiny a částky z viditelných výkazů práce podle pracovníka."
      labelHeader="Pracovník"
      aggregate={byUser}
      searchParams={searchParams}
      canView={canViewPersonReports}
      deniedMessage="Nemáte oprávnění zobrazit reporting podle lidí."
    />
  );
}
