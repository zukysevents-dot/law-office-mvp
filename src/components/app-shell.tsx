import { AppSidebar } from "@/components/app-sidebar";
import { getCurrentUser } from "@/lib/auth";
import { userRoleLabels } from "@/lib/labels";
import { canViewAllLegalData } from "@/lib/permissions";

export async function AppShell({ children }: { children: React.ReactNode }) {
  // Middleware guarantees a valid session on (app) routes, so this resolves a
  // real user (or redirects to /login as a fallback).
  const currentUser = await getCurrentUser();
  const showAuditLog = canViewAllLegalData(currentUser);

  return (
    <div className="app-shell min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground lg:flex">
      <AppSidebar
        showAuditLog={showAuditLog}
        userName={currentUser.name}
        userRole={userRoleLabels[currentUser.role]}
      />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
