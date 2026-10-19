import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { SetPasswordForm } from "@/components/set-password-form";
import { safeQuery } from "@/lib/db-safe";
import { INVALID_INVITATION_MESSAGE } from "@/lib/user-invitation-messages";
import { findUsableInvitation } from "@/lib/user-invitations";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nastavení hesla",
  // One-time links must never be indexed or leak via Referer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Public landing page of the welcome invitation link (set your own password).
// Reveals nothing but the e-mail of the link's holder.
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const result = await safeQuery(null, async () => {
    const invitation = await findUsableInvitation(token);
    return invitation ? { email: invitation.user.email } : null;
  });

  return (
    <AuthShell>
      <h1 className="text-center text-xl font-semibold text-[var(--iv-ink)]">
        Nastavení hesla
      </h1>
      <p className="mb-6 mt-1 text-center text-sm text-[var(--iv-muted)]">
        Vlastní heslo k účtu v aplikaci IURIVERSE
      </p>

      {result.data ? (
        <SetPasswordForm token={token} email={result.data.email} />
      ) : (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
        >
          {result.databaseReady
            ? INVALID_INVITATION_MESSAGE
            : "Databáze teď není dostupná. Zkuste to prosím za chvíli."}
        </p>
      )}

      <p className="mt-6 text-center text-sm">
        <Link
          href="/login"
          className="font-medium text-[var(--iv-teal-ink)] hover:underline"
        >
          Zpět na přihlášení
        </Link>
      </p>
    </AuthShell>
  );
}
