import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { FloatingTimer } from "@/components/floating-timer";
import { NavigationCursor } from "@/components/navigation-cursor";
import { NavigationProgress } from "@/components/navigation-progress";
import { getCurrentUser } from "@/lib/auth";
import { userRoleLabels } from "@/lib/labels";
import { getAccessibleModules } from "@/lib/module-access.server";
import {
  canManageHr,
  canManageInvoices,
  canManageOrganization,
  canManagePermissions,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function AppShell({ children }: { children: React.ReactNode }) {
  // Middleware guarantees a valid session on (app) routes, so this resolves a
  // real user (or redirects to /login as a fallback).
  const currentUser = await getCurrentUser();
  const organization = await getPrisma().organization.findUnique({
    where: { id: currentUser.organizationId },
    select: { billingTimeIncrementMinutes: true },
  });
  // Hide nav items the user can't open: module permission from the matrix ∧
  // the office's entitlement (UX only — every page/action guards itself).
  const allowedModules = await getAccessibleModules(currentUser);
  const functions = {
    manageInvoices: canManageInvoices(currentUser),
    manageOrganization: canManageOrganization(currentUser),
    managePermissions: canManagePermissions(currentUser),
    manageHr: canManageHr(currentUser),
  };

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
        <NavigationProgress />
      </Suspense>
      <AppSidebar
        allowedModules={allowedModules}
        functions={functions}
        userName={currentUser.name}
        userRole={userRoleLabels[currentUser.role]}
      />
      <main id="app-main" tabIndex={-1} className="min-w-0 flex-1">
        {/* pb-24: the FloatingTimer is fixed to the bottom-right corner and was
            covering the last table row / pagination on every list page. */}
        <div className="flex w-full min-w-0 flex-col gap-6 px-4 pt-6 pb-24 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      {allowedModules.includes("module.workLogs") ? (
        <FloatingTimer
          incrementMinutes={organization?.billingTimeIncrementMinutes ?? 15}
        />
      ) : null}
      <CommandPalette />
    </div>
  );
}
