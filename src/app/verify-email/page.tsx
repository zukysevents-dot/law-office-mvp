import Link from "next/link";

import { verifyEmailAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Potvrzení e-mailu",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const invalid = params.error === "1" || !token;

  return (
    <AuthShell>
      <h1 className="text-center text-xl font-semibold text-[var(--iv-ink)]">
        Potvrzení e-mailu
      </h1>

      {invalid ? (
        <>
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            Potvrzovací odkaz je neplatný nebo vypršel. Požádejte o nový přes
            registrační formulář.
          </p>
          <Link
            href="/register"
            className="mt-6 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[var(--iv-deep)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--iv-deep-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--iv-deep)]"
          >
            Zpět na registraci
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-center text-sm text-[var(--iv-muted)]">
            Dokončete registraci a pokračujte k připojení ke kanceláři.
          </p>
          <form action={verifyEmailAction} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <Button type="submit" className="w-full">
              Potvrdit e-mail
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
