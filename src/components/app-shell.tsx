import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { FloatingTimer } from "@/components/floating-timer";
import { NavigationCursor } from "@/components/navigation-cursor";
import { getCurrentUser } from "@/lib/auth";
import { getEnabledModules } from "@/lib/entitlements";
import { userRoleLabels } from "@/lib/labels";
import { canManageInvoices, canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function AppShell({ children }: { children: React.ReactNode }) {
  // Middleware guarantees a valid session on (app) routes, so this resolves a
  // real user (or redirects to /login as a fallback).
  const currentUser = await getCurrentUser();
  const organization = await getPrisma().organization.findUnique({
    where: { id: currentUser.organizationId },
    select: { billingTimeIncrementMinutes: true },
  });
  const showAuditLog = canViewAllLegalData(currentUser);
  // Hide nav items for modules the org hasn't bought (UX only). The authoritative
  // guard is assertModuleEnabled, wired into each module's pages/actions as that
  // module ships (BILLING in F1, DEADLINES in F4) — menu hiding is not security.
  // Spread the Set to a string[]; a Set won't cross the server→client boundary.
  const enabledModules = [
    ...(await getEnabledModules(currentUser.organizationId)),
  ];

  return (
    <div className="app-shell min-h-screen w-full max-w-full text-foreground lg:flex">
      <a
        href="#app-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[10000] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--iv-deep)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--iv-teal)]"
      >
        Přeskočit na obsah
      </a>
      <Suspense fallback={null}>
        <NavigationCursor />
      </Suspense>
      <AppSidebar
        showAuditLog={showAuditLog}
        canManageInvoices={canManageInvoices(currentUser)}
        userName={currentUser.name}
        userRole={userRoleLabels[currentUser.role]}
        enabledModules={enabledModules}
      />
      <main id="app-main" tabIndex={-1} className="min-w-0 flex-1">
        {/* pb-24: the FloatingTimer is fixed to the bottom-right corner and was
            covering the last table row / pagination on every list page. */}
        <div className="flex w-full min-w-0 flex-col gap-6 px-4 pt-6 pb-24 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <FloatingTimer
        incrementMinutes={organization?.billingTimeIncrementMinutes ?? 15}
      />
      <CommandPalette />
    </div>
  );
}
