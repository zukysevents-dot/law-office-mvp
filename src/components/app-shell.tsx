import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground lg:flex">
      <AppSidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
