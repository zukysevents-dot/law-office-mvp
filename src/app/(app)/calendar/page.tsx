import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <>
      <PageHeader
        title="Kalendář"
        description="Termíny úkolů – procesní a interní lhůty napříč projekty a případy."
      />
      <CalendarView />
    </>
  );
}
