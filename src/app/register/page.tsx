import Link from "next/link";

import { registerAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Field, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Registrace",
};

const errorMessages: Record<string, string> = {
  name: "Zadejte prosím své jméno.",
  email: "Zadejte platnou e-mailovou adresu.",
  password: "Heslo musí mít alespoň 8 znaků.",
  exists: "Účet s tímto e-mailem už existuje. Přihlaste se.",
  rate: "Příliš mnoho pokusů o registraci. Zkuste to prosím později.",
  disabled: "Registrace je momentálně vypnutá. Kontaktujte administrátora.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const message = error ? errorMessages[error] : undefined;

  return (
    <AuthShell>
      <h1 className="text-center text-xl font-semibold text-[var(--iv-ink)]">
        Vytvoření účtu
      </h1>
      <p className="mb-6 mt-1 text-center text-sm text-[var(--iv-muted)]">
        Po registraci založíte vlastní kancelář, nebo se připojíte ke stávající
        pomocí registračního kódu.
      </p>

      {message ? (
        <p
          role="alert"
          className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {message}
        </p>
      ) : null}

      <form action={registerAction} className="grid gap-4">
        <Field label="Jméno a příjmení">
          <TextInput name="name" autoComplete="name" required />
        </Field>
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
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Button type="submit" className="mt-2 w-full">
          Vytvořit účet
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--iv-muted)]">
        Už máte účet?{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--iv-teal-ink)] hover:underline"
        >
          Přihlaste se
        </Link>
      </p>
    </AuthShell>
  );
}
