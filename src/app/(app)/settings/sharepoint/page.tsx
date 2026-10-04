import {
  saveSharepointConfig,
  testSharepointConnection,
} from "@/app/actions/sharepoint-config";
import { Field, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  getGraphConfigForOrg,
  getSharepointUrlConfig,
} from "@/lib/microsoft/config";
import { canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Data = {
  allowed: boolean;
  encryptionReady: boolean;
  siteUrl: string | null;
  library: string | null;
  tenantId: string | null;
  clientId: string | null;
  hasSecret: boolean;
  // Skutečně platná konfigurace po započtení fallbacku na env.
  siteConfigured: boolean;
  graphConfigured: boolean;
  effectiveSiteUrl: string | null;
};

const EMPTY: Data = {
  allowed: false,
  encryptionReady: false,
  siteUrl: null,
  library: null,
  tenantId: null,
  clientId: null,
  hasSecret: false,
  siteConfigured: false,
  graphConfigured: false,
  effectiveSiteUrl: null,
};

/** Hlášky po uložení / testu připojení. */
function statusMessage(
  saved: boolean,
  test: string | undefined,
  items: string | undefined,
): { tone: "green" | "amber"; text: string } | null {
  if (test === "ok") {
    return {
      tone: "green",
      text: `Připojení funguje. V kořeni knihovny je ${items ?? "0"} položek.`,
    };
  }
  if (test === "failed") {
    return {
      tone: "amber",
      text: "Připojení selhalo. Zkontrolujte adresu webu, oprávnění aplikace v Azure AD (a udělený admin consent) a platnost client secretu.",
    };
  }
  if (test === "nosite") {
    return { tone: "amber", text: "Nejdřív vyplňte adresu webu SharePointu." };
  }
  if (test === "nograph") {
    return {
      tone: "amber",
      text: "Chybí Graph přihlašovací údaje — bez nich funguje jen režim odkazů.",
    };
  }
  if (saved) {
    return { tone: "green", text: "Nastavení uloženo." };
  }
  return null;
}

type PageProps = {
  searchParams: Promise<{
    sharepoint?: string;
    test?: string;
    items?: string;
  }>;
};

export default async function SharepointSettingsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const result = await safeQuery<Data>(EMPTY, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);
    if (!canViewAllLegalData(currentUser)) {
      return EMPTY;
    }
    const organizationId = currentUser.organizationId;
    const [row, urlConfig, graphConfig] = await Promise.all([
      getPrisma().organizationSharepointConfig.findUnique({
        where: { organizationId },
        select: {
          siteUrl: true,
          library: true,
          tenantId: true,
          clientId: true,
          clientSecretEncrypted: true,
        },
      }),
      getSharepointUrlConfig(organizationId),
      getGraphConfigForOrg(organizationId),
    ]);
    return {
      allowed: true,
      encryptionReady: isEncryptionConfigured(),
      siteUrl: row?.siteUrl ?? null,
      library: row?.library ?? null,
      tenantId: row?.tenantId ?? null,
      clientId: row?.clientId ?? null,
      hasSecret: Boolean(row?.clientSecretEncrypted),
      siteConfigured: urlConfig !== null,
      graphConfigured: graphConfig !== null,
      effectiveSiteUrl: urlConfig?.siteUrl ?? null,
    };
  });

  const data = result.data ?? EMPTY;
  const status = statusMessage(
    params.sharepoint === "saved",
    params.test,
    params.items,
  );

  return (
    <>
      <PageHeader
        title="SharePoint — připojení"
        description="Připojte SharePoint své kanceláře. Client secret se ukládá šifrovaně a nikdy se nezobrazuje zpět."
        action={
          data.siteConfigured ? (
            <ButtonLink href="/documents/sharepoint/library" variant="secondary">
              Procházet knihovnu
            </ButtonLink>
          ) : null
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {result.databaseReady && !data.allowed ? (
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            Připojení SharePointu nastavuje pouze partner nebo administrátor.
          </p>
        </Section>
      ) : null}

      {data.allowed ? (
        <>
          {status ? (
            <Section
              className={
                status.tone === "green"
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-amber-300 bg-amber-50"
              }
            >
              <p
                className={
                  status.tone === "green"
                    ? "text-sm text-emerald-900"
                    : "text-sm text-amber-900"
                }
              >
                {status.text}
              </p>
            </Section>
          ) : null}

          <Section title="Stav">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                tone={
                  data.graphConfigured && data.siteConfigured
                    ? "green"
                    : data.siteConfigured
                      ? "blue"
                      : "amber"
                }
              >
                {data.graphConfigured && data.siteConfigured
                  ? "Připojeno — procházení i zápis"
                  : data.siteConfigured
                    ? "Pouze odkazy — bez procházení"
                    : "Nenakonfigurováno"}
              </Badge>
              {data.effectiveSiteUrl ? (
                <span className="break-all text-sm text-stone-600">
                  {data.effectiveSiteUrl}
                </span>
              ) : null}
              {data.siteConfigured && data.graphConfigured ? (
                <form action={testSharepointConnection}>
                  <Button type="submit" variant="secondary">
                    Otestovat připojení
                  </Button>
                </form>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-stone-600">
              Bez Graph přihlašovacích údajů umí aplikace jen skládat odkazy do
              SharePointu podle konvence. S nimi navíc zakládá složky, vypisuje
              obsah a nahrává soubory.
            </p>
          </Section>

          {!data.encryptionReady ? (
            <Section title="Chybí šifrovací klíč">
              <p className="text-sm text-amber-900">
                Není nastaven <code>DATA_ENCRYPTION_KEY</code>. Bez něj nelze
                client secret bezpečně uložit. Nastavte 32bajtový klíč v base64
                (např. <code>openssl rand -base64 32</code>) a restartujte
                aplikaci.
              </p>
            </Section>
          ) : null}

          <Section title="Nastavení">
            <form action={saveSharepointConfig} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Adresa webu SharePointu">
                  <TextInput
                    name="siteUrl"
                    type="url"
                    defaultValue={data.siteUrl ?? ""}
                    placeholder="https://kancelar.sharepoint.com/sites/Spisy"
                  />
                </Field>
                <Field label="Knihovna dokumentů">
                  <TextInput
                    name="library"
                    defaultValue={data.library ?? ""}
                    placeholder="Dokumenty"
                  />
                </Field>
                <Field label="Directory (tenant) ID">
                  <TextInput
                    name="tenantId"
                    defaultValue={data.tenantId ?? ""}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </Field>
                <Field label="Application (client) ID">
                  <TextInput
                    name="clientId"
                    defaultValue={data.clientId ?? ""}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </Field>
                <Field
                  label={
                    data.hasSecret
                      ? "Client secret (uložen — vyplňte jen při změně)"
                      : "Client secret"
                  }
                >
                  <TextInput
                    name="clientSecret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={data.hasSecret ? "••••••••" : ""}
                  />
                </Field>
              </div>
              <div>
                <Button type="submit" disabled={!data.encryptionReady}>
                  Uložit
                </Button>
              </div>
            </form>
          </Section>

          <Section title="Jak získat přihlašovací údaje">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-600">
              <li>
                Azure Portal → <em>App registrations</em> → nová registrace.
                Opište <em>Directory (tenant) ID</em> a{" "}
                <em>Application (client) ID</em>.
              </li>
              <li>
                <em>Certificates &amp; secrets</em> → vytvořte client secret a
                zkopírujte jeho hodnotu (zobrazí se jen jednou).
              </li>
              <li>
                <em>API permissions</em> → Microsoft Graph →{" "}
                <strong>Application permissions</strong> →{" "}
                <code>Sites.Selected</code> → <em>Grant admin consent</em>.
                Doporučujeme <code>Sites.Selected</code> místo{" "}
                <code>Sites.ReadWrite.All</code> — aplikace pak vidí jen web,
                který jí výslovně povolíte, ne všechny weby tenanta.
              </li>
              <li>Vyplňte pole výše, uložte a klikněte na Otestovat připojení.</li>
            </ol>
          </Section>
        </>
      ) : null}
    </>
  );
}
