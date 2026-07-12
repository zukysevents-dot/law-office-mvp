import Image from "next/image";
import Link from "next/link";

import { verifyEmailAction } from "@/app/actions/auth";
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
          Potvrzení e-mailu
        </h1>

        {invalid ? (
          <>
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              Potvrzovací odkaz je neplatný nebo vypršel. Požádejte o nový přes registrační formulář.
            </p>
            <Link
              href="/register"
              className="mt-6 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#072924] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b3b33] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#072924]"
            >
              Zpět na registraci
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-stone-600">
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
      </div>
    </main>
  );
}
