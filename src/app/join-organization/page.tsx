import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { OrganizationOnboarding } from "@/components/organization-onboarding";
import { SubmitButton } from "@/components/ui/submit-button";
import { OrganizationMemberStatus, OrganizationStatus } from "@/generated/prisma/enums";
import { getAuthUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vaše kancelář",
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
    <AuthShell className="max-w-md">
      <OrganizationOnboarding joinError={message} />

      <form action={logoutAction} className="mt-6 text-center">
        <SubmitButton
          pendingLabel="Odhlašuji…"
          className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-[var(--iv-muted)] underline-offset-2 hover:bg-[var(--iv-bg)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--iv-teal-ink)]"
        >
          Odhlásit se
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
