import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Správa platformy — syndikat.legal",
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
      <header className="flex items-center justify-between gap-3 border-b border-[#0b3b33] bg-[#072924] px-4 py-3 sm:px-6">
        <Link href="/admin" className="flex items-center gap-2 text-white">
          <span className="text-sm font-semibold tracking-wide">
            syndikat.legal · Správa platformy
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-[#9cc6ad] sm:inline">
            {user.name}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm font-medium text-[#d8eee0] transition hover:text-white"
            >
              Odhlásit se
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
