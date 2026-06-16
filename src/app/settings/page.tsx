import { createUser } from "@/app/actions/users";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { options, userRoleLabels } from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SettingsData = {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: keyof typeof userRoleLabels;
    microsoftId: string | null;
    active: boolean;
    createdAt: Date;
  }>;
  auditLogCount: number;
};

export default async function SettingsPage() {
  const result = await safeQuery<SettingsData>(
    { users: [], auditLogCount: 0 },
    async () => {
      const prisma = getPrisma();
      const [users, auditLogCount] = await Promise.all([
        prisma.user.findMany({
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            microsoftId: true,
            active: true,
            createdAt: true,
          },
        }),
        prisma.auditLog.count(),
      ]);

      return { users, auditLogCount };
    },
  );

  return (
    <>
      <PageHeader
        title="Nastavení"
        description="Uživatelé, role a technické přípravy pro Microsoft přihlášení a audit."
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <Section title="Uživatelé">
          {result.data.users.length > 0 ? (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Jméno</th>
                    <th>E-mail</th>
                    <th>Role</th>
                    <th>Microsoft ID</th>
                    <th>Stav</th>
                    <th>Vytvořeno</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.users.map((user) => (
                    <tr key={user.id}>
                      <td className="font-medium text-stone-950">{user.name}</td>
                      <td>{user.email}</td>
                      <td>{userRoleLabels[user.role]}</td>
                      <td className="font-mono text-xs">{user.microsoftId ?? "—"}</td>
                      <td>
                        <Badge tone={user.active ? "green" : "neutral"}>
                          {user.active ? "Aktivní" : "Neaktivní"}
                        </Badge>
                      </td>
                      <td>{formatDate(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Zatím nejsou založení žádní uživatelé.</EmptyState>
          )}
        </Section>
        <Section title="Nový uživatel">
          <form action={createUser} className="grid gap-4">
            <Field label="Jméno">
              <TextInput name="name" required />
            </Field>
            <Field label="E-mail">
              <TextInput name="email" type="email" required />
            </Field>
            <Field label="Role">
              <SelectInput name="role" defaultValue="LAWYER">
                {options.userRoles.map((role) => (
                  <option key={role} value={role}>
                    {userRoleLabels[role]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Microsoft ID">
              <TextInput name="microsoftId" />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <input
                type="checkbox"
                name="active"
                defaultChecked
                className="h-4 w-4 rounded border-stone-300 text-emerald-950"
              />
              Aktivní
            </label>
            <Button type="submit">Vytvořit uživatele</Button>
          </form>
        </Section>
      </div>
      <Section title="Audit">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">
              Záznamy auditu
            </p>
            <p className="text-2xl font-semibold text-stone-950">
              {result.data.auditLogCount}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm leading-6 text-stone-600">
              Databázový model auditu je připravený a server actions zapisují
              klíčové změny u subjektů, projektů, případů, úkolů a výkazů práce.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
