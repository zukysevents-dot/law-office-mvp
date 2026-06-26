import { saveDataBoxAccount } from "@/app/actions/data-boxes";
import { Field, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDate } from "@/lib/format";
import { canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  boxId: string;
  label: string;
  status: string;
  lastSyncedAt: Date | null;
};

type Data = {
  allowed: boolean;
  encryptionReady: boolean;
  accounts: AccountRow[];
};

export default async function DataBoxSettingsPage() {
  const result = await safeQuery<Data>(
    { allowed: false, encryptionReady: false, accounts: [] },
    async () => {
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.DATA_BOXES);
      if (!canViewAllLegalData(currentUser)) {
        return { allowed: false, encryptionReady: false, accounts: [] };
      }
      const accounts = await getPrisma().dataBoxAccount.findMany({
        where: { organizationId: currentUser.organizationId },
        select: {
          id: true,
          boxId: true,
          label: true,
          status: true,
          lastSyncedAt: true,
        },
        orderBy: { createdAt: "asc" },
      });
      return {
        allowed: true,
        encryptionReady: isEncryptionConfigured(),
        accounts,
      };
    },
  );

  const data = result.data ?? {
    allowed: false,
    encryptionReady: false,
    accounts: [],
  };

  return (
    <>
      <PageHeader
        title="Datové schránky — přístup"
        description="Přihlašovací údaje k datové schránce. Ukládají se šifrovaně a nikdy se nezobrazují zpět."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {result.databaseReady && !data.allowed ? (
        <Section title="Přístup odepřen">
          <p className="text-sm text-stone-600">
            Přístup k datové schránce konfiguruje pouze partner nebo
            administrátor.
          </p>
        </Section>
      ) : null}

      {data.allowed ? (
        <>
          {!data.encryptionReady ? (
            <Section title="Chybí šifrovací klíč">
              <p className="text-sm text-amber-900">
                Není nastaven <code>DATA_ENCRYPTION_KEY</code>. Bez něj nelze
                přihlašovací údaje bezpečně uložit. Nastavte 32bajtový klíč v
                base64 (např. <code>openssl rand -base64 32</code>) a restartujte
                aplikaci.
              </p>
            </Section>
          ) : null}

          <Section title="Datové schránky kanceláře">
            {data.accounts.length > 0 ? (
              <div className="table-scroll">
                <table className="w-max min-w-full">
                  <thead>
                    <tr>
                      <th>Název</th>
                      <th>ID schránky</th>
                      <th>Stav</th>
                      <th>Poslední synchronizace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map((account) => (
                      <tr key={account.id}>
                        <td className="font-medium text-stone-950">
                          {account.label}
                        </td>
                        <td className="font-mono text-xs">{account.boxId}</td>
                        <td>
                          <Badge
                            tone={
                              account.status === "ACTIVE" ? "green" : "neutral"
                            }
                          >
                            {account.status === "ACTIVE"
                              ? "Aktivní"
                              : "Vypnutá"}
                          </Badge>
                        </td>
                        <td>{formatDate(account.lastSyncedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>
                Zatím není nakonfigurovaná žádná datová schránka.
              </EmptyState>
            )}
          </Section>

          <Section title="Přidat / upravit schránku">
            <p className="mb-4 text-sm text-stone-600">
              Přihlašovací údaje se uloží šifrovaně (AES-256-GCM) a v aplikaci se
              už nikdy nezobrazí. Automatická synchronizace s ISDS bude doplněna
              po napojení na poskytovatele; zatím se zprávy evidují ručně.
            </p>
            <form action={saveDataBoxAccount} className="grid gap-4 sm:max-w-xl">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ID datové schránky">
                  <TextInput name="boxId" required />
                </Field>
                <Field label="Název (interní)">
                  <TextInput name="label" required placeholder="Hlavní DS" />
                </Field>
                <Field label="Přihlašovací jméno">
                  <TextInput name="username" autoComplete="off" />
                </Field>
                <Field label="Heslo">
                  <TextInput
                    name="password"
                    type="password"
                    autoComplete="new-password"
                  />
                </Field>
              </div>
              <div>
                <Button type="submit" disabled={!data.encryptionReady}>
                  Uložit přístup
                </Button>
              </div>
            </form>
          </Section>
        </>
      ) : null}
    </>
  );
}
