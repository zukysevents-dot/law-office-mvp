import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/page-header";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import { normalizeCalendarView } from "@/lib/calendar-view";
import { getNotificationPreference } from "@/lib/notifications/notification-service";
import { AccessDenied } from "@/components/access-denied";
import { moduleAccessDenial } from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.calendar");
  if (accessDenied) {
    return <AccessDenied title="Kalendář" message={accessDenied} />;
  }

  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DEADLINES);
  const preference = await getNotificationPreference(currentUser.id);

  return (
    <>
      <PageHeader
        title="Kalendář"
        description="Termíny úkolů – procesní a interní lhůty napříč projekty a případy."
      />
      <CalendarView
        initialView={normalizeCalendarView(preference.calendarDefaultView)}
      />
    </>
  );
}
