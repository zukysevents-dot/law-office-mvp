import { ReportView } from "@/components/report-view";
import { byMonth } from "@/lib/reporting/aggregations";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function HoursReportPage({ searchParams }: PageProps) {
  return (
    <ReportView
      title="Měsíční přehled hodin"
      description="Odpracované hodiny a částky z viditelných výkazů práce po měsících."
      labelHeader="Měsíc"
      aggregate={byMonth}
      searchParams={searchParams}
    />
  );
}
