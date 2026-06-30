import {
  changeOwnPassword,
  createUser,
  setUserCapabilities,
  setUserPassword,
  updateNotificationPreference,
  updateUserHoursPlan,
} from "@/app/actions/users";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { Capability, UserRole } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDate } from "@/lib/format";
import {
  capabilityDescriptions,
  capabilityLabels,
  capabilityOptions,
  options,
  userRoleLabels,
} from "@/lib/labels";
import { getNotificationPreference } from "@/lib/notifications/notification-service";
import { canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type NotificationPreferenceData = Awaited<
  ReturnType<typeof getNotificationPreference>
>;

type SettingsData = {
  currentUserName: string;
  notificationPreference: NotificationPreferenceData | null;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: keyof typeof userRoleLabels;
    microsoftId: string | null;
    active: boolean;
    createdAt: Date;
    hoursPlan: {
      weeklyHoursTarget: number | null;
      monthlyHoursTarget: number | null;
    } | null;
    capabilities: Capability[];
  }>;
  auditLogCount: number;
  allowed: boolean;
};

function PreferenceCheckbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-stone-300 text-emerald-950"
      />
      {label}
    </label>
  );
}

export default async function SettingsPage() {
  const result = await safeQuery<SettingsData>(
    {
      currentUserName: "",
      notificationPreference: null,
      users: [],
      auditLogCount: 0,
      allowed: false,
    },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const allowed = canViewAllLegalData(currentUser);
      const [notificationPreference, users, auditLogCount] = await Promise.all([
        getNotificationPreference(currentUser.id),
        allowed
          ? prisma.user.findMany({
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                microsoftId: true,
                active: true,
                createdAt: true,
                hoursPlan: {
                  select: {
                    weeklyHoursTarget: true,
                    monthlyHoursTarget: true,
                  },
                },
                capabilityGrants: { select: { capability: true } },
              },
            })
          : Promise.resolve([]),
        allowed ? prisma.auditLog.count() : Promise.resolve(0),
      ]);

      return {
        currentUserName: currentUser.name,
        notificationPreference,
        users: users.map((user) => ({
          ...user,
          hoursPlan: user.hoursPlan
            ? {
                weeklyHoursTarget:
                  user.hoursPlan.weeklyHoursTarget != null
                    ? Number(user.hoursPlan.weeklyHoursTarget)
                    : null,
                monthlyHoursTarget:
                  user.hoursPlan.monthlyHoursTarget != null
                    ? Number(user.hoursPlan.monthlyHoursTarget)
                    : null,
              }
            : null,
          capabilities: user.capabilityGrants.map((grant) => grant.capability),
        })),
        auditLogCount,
        allowed,
      };
    },
  );
  const preference = result.data.notificationPreference;

  return (
    <>
      <PageHeader
        title="Nastavení"
        description="Osobní notifikace, uživatelé, role a audit."
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      {preference ? (
        <Section title="Moje notifikace">
          <form action={updateNotificationPreference} className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2">
              <PreferenceCheckbox
                name="emailEnabled"
                label="Zapnout e-mailové notifikace"
                defaultChecked={preference.emailEnabled}
              />
              <PreferenceCheckbox
                name="taskCreatedEmail"
                label="Nový úkol"
                defaultChecked={preference.taskCreatedEmail}
              />
              <PreferenceCheckbox
                name="taskStatusChangedEmail"
                label="Změna statusu úkolu"
                defaultChecked={preference.taskStatusChangedEmail}
              />
              <PreferenceCheckbox
                name="taskForReviewEmail"
                label="Úkol předaný ke kontrole"
                defaultChecked={preference.taskForReviewEmail}
              />
              <PreferenceCheckbox
                name="taskDeadlineSoonEmail"
                label="Upozornění před deadlinem"
                defaultChecked={preference.taskDeadlineSoonEmail}
              />
              <PreferenceCheckbox
                name="taskFiledFollowupEmail"
                label="Kontrola po statusu Podáno"
                defaultChecked={preference.taskFiledFollowupEmail}
              />
              <PreferenceCheckbox
                name="deadlineSoonEmail"
                label="Blížící se lhůta (lhůtník)"
                defaultChecked={preference.deadlineSoonEmail}
              />
              <PreferenceCheckbox
                name="deadlineOverdueEmail"
                label="Lhůta po termínu (lhůtník)"
                defaultChecked={preference.deadlineOverdueEmail}
              />
              <PreferenceCheckbox
                name="courtHearingSoonEmail"
                label="Blížící se soudní jednání"
                defaultChecked={preference.courtHearingSoonEmail}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Upozornit kolik dní před deadlinem">
                <TextInput
                  name="deadlineReminderDays"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={preference.deadlineReminderDays}
                />
              </Field>
              <Field label="Kontrola kolik dní po statusu Podáno">
                <TextInput
                  name="filedFollowupDays"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={preference.filedFollowupDays}
                />
              </Field>
              <Field label="Upozornit kolik dní před lhůtou (lhůtník)">
                <TextInput
                  name="deadlineWatchDaysBefore"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={preference.deadlineWatchDaysBefore}
                />
              </Field>
            </div>
            <div>
              <Button type="submit">Uložit notifikace</Button>
            </div>
          </form>
        </Section>
      ) : null}
      <Section title="Změna hesla">
        <form action={changeOwnPassword} className="grid max-w-sm gap-4">
          <Field label="Stávající heslo">
            <TextInput
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Nové heslo (min. 8 znaků)">
            <TextInput
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <div>
            <Button type="submit">Změnit heslo</Button>
          </div>
        </form>
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dvoufaktorové ověření (2FA) zatím není k dispozici a bude doplněno
          později. Zatím je účet chráněn e-mailem a heslem.
        </p>
      </Section>
      {result.data.allowed ? (
        <>
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
                          <td className="font-medium text-stone-950">
                            {user.name}
                          </td>
                          <td>{user.email}</td>
                          <td>{userRoleLabels[user.role]}</td>
                          <td className="font-mono text-xs">
                            {user.microsoftId ?? "—"}
                          </td>
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
                <Field label="Počáteční heslo (min. 8 znaků)">
                  <TextInput
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
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
          {result.data.users.length > 0 ? (
            <Section title="Reset hesla uživatele">
              <form action={setUserPassword} className="grid max-w-sm gap-4">
                <Field label="Uživatel">
                  <SelectInput name="userId">
                    {result.data.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Nové heslo (min. 8 znaků)">
                  <TextInput
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </Field>
                <div>
                  <Button type="submit">Nastavit heslo</Button>
                </div>
              </form>
            </Section>
          ) : null}
          {result.data.users.length > 0 ? (
            <Section title="Plán hodin pracovníků">
              <p className="mb-4 text-sm text-stone-600">
                Týdenní a měsíční cíl vykázaných hodin pro „% plnění“ na
                výkazech a týdenní graf na dashboardu. Prázdné pole cíl zruší.
              </p>
              <div className="grid gap-3">
                {result.data.users.map((user) => (
                  <form
                    key={user.id}
                    action={updateUserHoursPlan}
                    className="grid items-end gap-3 rounded-md border border-stone-200 p-3 sm:grid-cols-[1fr_140px_140px_auto]"
                  >
                    <input type="hidden" name="userId" value={user.id} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-950">
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-stone-500">
                        {userRoleLabels[user.role]}
                      </p>
                    </div>
                    <Field label="Týdně (h)">
                      <TextInput
                        name="weeklyHoursTarget"
                        type="number"
                        min={0}
                        step="0.5"
                        defaultValue={user.hoursPlan?.weeklyHoursTarget ?? undefined}
                      />
                    </Field>
                    <Field label="Měsíčně (h)">
                      <TextInput
                        name="monthlyHoursTarget"
                        type="number"
                        min={0}
                        step="0.5"
                        defaultValue={
                          user.hoursPlan?.monthlyHoursTarget ?? undefined
                        }
                      />
                    </Field>
                    <Button type="submit" variant="secondary" className="self-end">
                      Uložit
                    </Button>
                  </form>
                ))}
              </div>
            </Section>
          ) : null}
          {result.data.users.length > 0 ? (
            <Section title="Oprávnění uživatelů">
              <p className="mb-4 text-sm text-stone-600">
                Granty nad rámec role — např. přístup k fakturaci pro vybrané
                advokáty nebo zobrazení sazeb. Admin a partner mají plný přístup
                automaticky dle role.
              </p>
              <div className="grid gap-3">
                {result.data.users.map((user) => {
                  const fullByRole =
                    user.role === UserRole.ADMIN ||
                    user.role === UserRole.PARTNER;
                  return (
                    <div
                      key={user.id}
                      className="grid gap-3 rounded-md border border-stone-200 p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-stone-950">
                          {user.name}
                        </p>
                        <p className="truncate text-xs text-stone-500">
                          {userRoleLabels[user.role]}
                        </p>
                      </div>
                      {fullByRole ? (
                        <Badge tone="green">Plný přístup dle role</Badge>
                      ) : (
                        <form
                          action={setUserCapabilities}
                          className="flex flex-wrap items-center gap-4"
                        >
                          <input type="hidden" name="userId" value={user.id} />
                          {capabilityOptions.map((capability) => (
                            <label
                              key={capability}
                              className="flex items-center gap-2 text-sm text-stone-700"
                              title={capabilityDescriptions[capability]}
                            >
                              <input
                                type="checkbox"
                                name="capabilities"
                                value={capability}
                                defaultChecked={user.capabilities.includes(
                                  capability,
                                )}
                                className="h-4 w-4 rounded border-stone-300 text-emerald-950"
                              />
                              {capabilityLabels[capability]}
                            </label>
                          ))}
                          <Button type="submit" variant="secondary">
                            Uložit
                          </Button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          ) : null}
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
                  Databázový model auditu je připravený a server actions
                  zapisují klíčové změny včetně osobních notifikačních
                  preferencí.
                </p>
              </div>
            </div>
          </Section>
        </>
      ) : (
        <Section title="Správa uživatelů">
          <p className="text-sm text-stone-600">
            Přihlášený uživatel {result.data.currentUserName || "—"} nemá
            oprávnění spravovat uživatele.
          </p>
        </Section>
      )}
    </>
  );
}
