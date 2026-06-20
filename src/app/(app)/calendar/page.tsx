import { CalendarDays } from "lucide-react";

import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/page-header";
import { isOutlookCalendarEnabled } from "@/lib/microsoft/outlook";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <>
      <PageHeader
        title="Kalendář"
        description="Termíny úkolů – procesní a interní lhůty napříč projekty a případy."
      />
      {!isOutlookCalendarEnabled() ? (
        <p className="flex items-center gap-2 rounded-lg border border-[#d4e2dc] bg-[#eef5f1] px-3 py-2 text-sm text-[#5f756e]">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
          Outlook se připojí po přihlášení přes Microsoft. Zatím se zobrazují
          termíny úkolů.
        </p>
      ) : null}
      <CalendarView />
    </>
  );
}
