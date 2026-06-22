import Image from "next/image";
import Link from "next/link";

import { registerAction } from "@/app/actions/auth";
import { Field, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Registrace — syndikat.legal",
};

const errorMessages: Record<string, string> = {
  name: "Zadejte prosím své jméno.",
  email: "Zadejte platnou e-mailovou adresu.",
  password: "Heslo musí mít alespoň 8 znaků.",
  exists: "Účet s tímto e-mailem už existuje. Přihlaste se.",
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
    <main className="flex min-h-screen items-center justify-center bg-[#072924] px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex justify-center">
          <Image
            src="/brand/logo-light.jpeg"
            alt="syndikat.legal"
            width={1015}
            height={326}
            priority
            className="h-12 w-auto rounded-lg"
          />
        </div>
        <h1 className="text-center text-xl font-semibold text-stone-900">
          Vytvoření účtu
        </h1>
        <p className="mt-1 mb-6 text-center text-sm text-stone-500">
          Po registraci se připojíte ke kanceláři pomocí registračního kódu.
        </p>

        {message ? (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </p>
        ) : null}

        <form action={registerAction} className="grid gap-4">
          <Field label="Jméno a příjmení">
            <TextInput name="name" autoComplete="name" required />
          </Field>
          <Field label="E-mail">
            <TextInput name="email" type="email" autoComplete="username" required />
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

        <p className="mt-6 text-center text-sm text-stone-500">
          Už máte účet?{" "}
          <Link href="/login" className="font-medium text-[#072924] hover:underline">
            Přihlaste se
          </Link>
        </p>
      </div>
    </main>
  );
}
