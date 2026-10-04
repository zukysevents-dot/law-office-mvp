import { requestPortalLink } from "@/app/(portal)/actions";
import { AuthShell } from "@/components/auth-shell";
import { Field, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Klientský portál — přihlášení",
};

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const org = typeof params.org === "string" ? params.org : "";
  const sent = params.sent === "1";
  const hasError = params.error === "1";

  return (
    <AuthShell mainId="portal-main-content" tabIndex={-1}>
      <h1 className="text-center text-xl font-semibold text-[var(--iv-ink)]">
        Klientský portál
      </h1>
      <p className="mb-6 mt-1 text-center text-sm text-[var(--iv-muted)]">
        Zadejte svůj e-mail a pošleme vám přihlašovací odkaz.
      </p>

        {sent ? (
          <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Pokud je e-mail evidovaný pro přístup do portálu, poslali jsme na něj
            přihlašovací odkaz. Platí 15 minut.
          </p>
        ) : null}

        {hasError ? (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            Odkaz je neplatný nebo vypršel. Vyžádejte si prosím nový.
          </p>
        ) : null}

        <form action={requestPortalLink} className="grid gap-4">
          <input type="hidden" name="org" value={org} />
          <Field label="E-mail">
            <TextInput
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Field>
          <Button type="submit" className="mt-2 w-full">
            Poslat přihlašovací odkaz
          </Button>
        </form>

        {!org ? (
          <p className="mt-4 text-center text-xs text-stone-600">
            Použijte prosím odkaz na portál od vaší advokátní kanceláře.
          </p>
        ) : null}
    </AuthShell>
  );
}
