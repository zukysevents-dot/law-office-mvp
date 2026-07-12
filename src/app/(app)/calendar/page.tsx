import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/page-header";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DEADLINES);

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
