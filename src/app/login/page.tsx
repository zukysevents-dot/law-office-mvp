import Link from "next/link";

import { loginAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Field, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Přihlášení",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const from = typeof params.from === "string" ? params.from : "/dashboard";

  return (
    <AuthShell>
      <h1 className="text-center text-xl font-semibold text-[var(--iv-ink)]">
        Přihlášení
      </h1>
      <p className="mb-6 mt-1 text-center text-sm text-[var(--iv-muted)]">
        Pracovní prostředí pro vaši advokátní kancelář
      </p>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error === "rate"
            ? "Příliš mnoho neúspěšných pokusů. Zkuste to prosím za 15 minut."
            : "Nesprávný e-mail nebo heslo."}
        </p>
      ) : null}

      <form action={loginAction} className="grid gap-4">
        <input type="hidden" name="from" value={from} />
        <Field label="E-mail">
          <TextInput
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Heslo">
          <TextInput
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" className="mt-2 w-full">
          Přihlásit se
        </Button>
      </form>

      {/* Bez tohoto odkazu byl /login slepá ulička: nový uživatel se odsud
          nedostal na registraci ani zpět na úvodní stránku. */}
      <p className="mt-6 text-center text-sm text-[var(--iv-muted)]">
        Nemáte účet?{" "}
        <Link
          href="/register"
          className="font-medium text-[var(--iv-teal-ink)] hover:underline"
        >
          Zaregistrujte se
        </Link>
      </p>
      <p className="mt-2 text-center text-sm">
        <Link
          href="/"
          className="text-[var(--iv-muted)] underline-offset-2 hover:underline"
        >
          Zpět na úvodní stránku
        </Link>
      </p>
    </AuthShell>
  );
}
