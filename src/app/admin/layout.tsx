import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { IuriverseLogo } from "@/components/landing/iuriverse-logo";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Správa platformy",
};

// Platform/developer super-admin shell. Lives OUTSIDE the (app) group because
// AppShell requires an org membership, which platform admins don't have.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();
  if (!user.isPlatformAdmin) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground">
      <a
        href="#admin-main-content"
        className="fixed left-4 top-3 z-50 -translate-y-20 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#0e1822] shadow-lg transition focus:translate-y-0"
      >
        Přeskočit na obsah
      </a>
      <header className="flex items-center justify-between gap-3 border-b border-[#16242f] bg-[#0e1822] px-4 py-3 sm:px-6">
        <Link href="/admin" className="flex items-center gap-2 text-white">
          <IuriverseLogo
            tone="light"
            className="gap-2"
            markClassName="h-7 w-7"
          />
          <span className="hidden text-xs text-white/60 md:inline">
            Správa platformy
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-[#aebecb] sm:inline">
            {user.name}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-[#dbe7ec] transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Odhlásit se
            </button>
          </form>
        </div>
      </header>
      <main id="admin-main-content" tabIndex={-1} className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
