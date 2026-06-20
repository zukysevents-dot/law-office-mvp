import { AppSidebar } from "@/components/app-sidebar";
import { getCurrentUser } from "@/lib/auth";
import { canViewAuditLog } from "@/lib/permissions";

async function auditLogNavigationAllowed() {
  try {
    const currentUser = await getCurrentUser();
    return canViewAuditLog(currentUser);
  } catch {
    return false;
  }
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const showAuditLog = await auditLogNavigationAllowed();

  return (
    <div className="app-shell min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground lg:flex">
      <AppSidebar showAuditLog={showAuditLog} />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
