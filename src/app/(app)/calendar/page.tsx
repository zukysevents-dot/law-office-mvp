import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/page-header";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import { normalizeCalendarView } from "@/lib/calendar-view";
import { getOutlookFeedSummary } from "@/lib/calendar/outlook-feed.server";
import { getCalendarScopeContext } from "@/lib/calendar-scope.server";
import { safeQuery } from "@/lib/db-safe";
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
  const outlook = await safeQuery(null, () => getOutlookFeedSummary(currentUser));
  const scopeContext = await safeQuery(null, () => getCalendarScopeContext(currentUser));

  return (
    <>
      <PageHeader
        title="Kalendář"
        description="Vaše termíny úkolů, lhůty, soudní jednání a – pokud si ho propojíte – váš Outlook kalendář. Kdo na to má právo, přepne na tým nebo celou kancelář."
      />
      <CalendarView
        initialView={normalizeCalendarView(preference.calendarDefaultView)}
        outlook={outlook.data}
        scopeOptions={scopeContext.data?.available ?? ["mine"]}
      />
    </>
  );
}
