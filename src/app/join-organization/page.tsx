import Image from "next/image";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { joinOrganization } from "@/app/actions/organizations";
import { Field, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { OrganizationMemberStatus, OrganizationStatus } from "@/generated/prisma/enums";
import { getAuthUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Připojení ke kanceláři — syndikat.legal",
};

const errorMessages: Record<string, string> = {
  INVALID: "Neplatný, neaktivní nebo expirovaný registrační kód.",
  FULL: "Kancelář již využívá maximální počet aktivních účtů. Kontaktujte správce kanceláře.",
  ALREADY: "Už jste aktivním členem této kanceláře.",
};

export default async function JoinOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthUser();

  // Platform admins manage orgs from /admin, they don't join one.
  if (user.isPlatformAdmin) {
    redirect("/admin");
  }

  // Already in a firm → straight into the app (single active org this phase).
  const activeMembership = await getPrisma().organizationMember.findFirst({
    where: {
      userId: user.id,
      status: OrganizationMemberStatus.ACTIVE,
      organization: { is: { status: OrganizationStatus.ACTIVE } },
    },
    select: { id: true },
  });
  if (activeMembership) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const message = error ? errorMessages[error] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#072924] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
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
          Připojení ke kanceláři
        </h1>
        <p className="mt-1 mb-6 text-center text-sm text-stone-500">
          Zadejte registrační kód, který vám předal správce vaší advokátní
          kanceláře. Kód není přihlašovací údaj — pouze vás připojí ke kanceláři.
        </p>

        {message ? (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </p>
        ) : null}

        <form action={joinOrganization} className="grid gap-4">
          <Field label="Registrační kód">
            <TextInput
              name="code"
              placeholder="ABCD-EFGH-JKLM"
              autoComplete="off"
              autoCapitalize="characters"
              required
            />
          </Field>
          <Field label="Jméno a příjmení">
            <TextInput name="name" defaultValue={user.name} autoComplete="name" />
          </Field>
          <Button type="submit" className="mt-2 w-full">
            Připojit se ke kanceláři
          </Button>
        </form>

        <form action={logoutAction} className="mt-6 text-center">
          <button
            type="submit"
            className="text-sm text-stone-500 underline-offset-2 hover:underline"
          >
            Odhlásit se
          </button>
        </form>
      </div>
    </main>
  );
}
