import Image from "next/image";

import { loginAction } from "@/app/actions/auth";
import { Field, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Přihlášení — syndikat.legal",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";
  const from = typeof params.from === "string" ? params.from : "/dashboard";

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
          Přihlášení
        </h1>
        <p className="mt-1 mb-6 text-center text-sm text-stone-500">
          Interní systém advokátní kanceláře
        </p>

        {hasError ? (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Nesprávný e-mail nebo heslo.
          </p>
        ) : null}

        <form action={loginAction} className="grid gap-4">
          <input type="hidden" name="from" value={from} />
          <Field label="E-mail">
            <TextInput name="email" type="email" autoComplete="username" required />
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
      </div>
    </main>
  );
}
