import Link from "next/link";

import {
  changeOwnPassword,
  setUserPassword,
  updateCalendarPreference,
  updateNotificationPreference,
  updateUserHoursPlan,
} from "@/app/actions/users";
import { CreateUserForm } from "@/components/create-user-form";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { ResendInvitationButton } from "@/components/resend-invitation-button";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  mailConfigStatus,
  mailDisabledReasonLabel,
} from "@/lib/mail/mailer";
import { userRoleLabels } from "@/lib/labels";
import { getNotificationPreference } from "@/lib/notifications/notification-service";
import { canManagePermissions, canManageUsers } from "@/lib/permissions";
import { loadPrivilegeTargets } from "@/lib/permission-store.server";
import { getPrisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";
import { calendarViewOptions, normalizeCalendarView } from "@/lib/calendar-view";
import { getAresBaseUrl, isAresLookupEnabled } from "@/lib/ares/config";
import {
  getGraphConfigForOrg,
  getGraphConfigFromEnv,
  getSharepointConfigFromEnv,
  getSharepointUrlConfig,
} from "@/lib/microsoft/config";

export const dynamic = "force-dynamic";

type NotificationPreferenceData = Awaited<
  ReturnType<typeof getNotificationPreference>
>;

type InvitationSummary = {
  createdAt: Date;
  sentAt: Date | null;
  usedAt: Date | null;
} | null;

type SettingsData = {
  currentUserName: string;
  currentUserId: string;
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
    invitation: InvitationSummary;
  }>;
  auditLogCount: number;
  allowed: boolean;
  canManagePermissions: boolean;
  // Role, které smí aktuální uživatel přidělit novému uživateli, a uživatelé,
  // kterým smí resetovat heslo (bez eskalace práv — viz privilegedTargetDenial).
  assignableRoles: UserRole[];
  resettableUserIds: string[];
  integrations: {
    aresEnabled: boolean;
    aresHost: string;
    sharepointSiteConfigured: boolean;
    sharepointHost: string | null;
    graphConfigured: boolean;
  };
};

function hostnameOf(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

// Fallback varianta pro safeQuery: běží dřív, než víme, že DB žije, a bez
// currentUser — proto smí číst jen env, nikdy konfiguraci kanceláře.
function envIntegrationStatus(): SettingsData["integrations"] {
  const sharepoint = getSharepointConfigFromEnv();
  return {
    aresEnabled: isAresLookupEnabled(),
    aresHost: hostnameOf(getAresBaseUrl()),
    sharepointSiteConfigured: Boolean(sharepoint),
    sharepointHost: sharepoint ? hostnameOf(sharepoint.siteUrl) : null,
    graphConfigured: getGraphConfigFromEnv() !== null,
  };
}

async function integrationConfigStatus(
  organizationId: string,
): Promise<SettingsData["integrations"]> {
  const sharepoint = await getSharepointUrlConfig(organizationId);
  return {
    aresEnabled: isAresLookupEnabled(),
    aresHost: hostnameOf(getAresBaseUrl()),
    sharepointSiteConfigured: Boolean(sharepoint),
    sharepointHost: sharepoint ? hostnameOf(sharepoint.siteUrl) : null,
    graphConfigured: (await getGraphConfigForOrg(organizationId)) !== null,
  };
}


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

function invitationLabel(invitation: InvitationSummary) {
  if (!invitation) {
    return "—";
  }
  if (invitation.usedAt) {
    return `Heslo nastaveno ${formatDate(invitation.usedAt)}`;
  }
  if (invitation.sentAt) {
    return `Odesláno ${formatDateTime(invitation.sentAt)}`;
  }
  return "Neodesláno";
}

export default async function SettingsPage() {
  const result = await safeQuery<SettingsData>(
    {
      currentUserName: "",
      currentUserId: "",
      notificationPreference: null,
      users: [],
      auditLogCount: 0,
      allowed: false,
      canManagePermissions: false,
      assignableRoles: [],
      resettableUserIds: [],
      integrations: envIntegrationStatus(),
    },
    async () => {
      const prisma = getPrisma();
      const currentUser = await getCurrentUser();
      const allowed = canManageUsers(currentUser);
      const [notificationPreference, users, auditLogCount] = await Promise.all([
        getNotificationPreference(currentUser.id),
        allowed
          ? prisma.user.findMany({
              where: {
                memberships: {
                  some: { organizationId: currentUser.organizationId },
                },
              },
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
                // Latest welcome invitation (column "Pozvánka").
                invitationTokens: {
                  where: { organizationId: currentUser.organizationId },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { createdAt: true, sentAt: true, usedAt: true },
                },
              },
            })
          : Promise.resolve([]),
        allowed
          ? prisma.auditLog.count({
              where: {
                changedBy: {
                  is: {
                    memberships: {
                      some: { organizationId: currentUser.organizationId },
                    },
                  },
                },
              },
            })
          : Promise.resolve(0),
      ]);

      const privilegeTargets = allowed
        ? await loadPrivilegeTargets({
            actor: currentUser,
            organizationId: currentUser.organizationId,
            members: users.map((user) => ({ id: user.id, role: user.role })),
            db: prisma,
          })
        : { assignableRoles: [], manageableUserIds: [] };

      return {
        currentUserName: currentUser.name,
        currentUserId: currentUser.id,
        notificationPreference,
        users: users.map(({ invitationTokens, ...user }) => ({
          ...user,
          invitation: invitationTokens[0] ?? null,
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
        })),
        auditLogCount,
        allowed,
        canManagePermissions: canManagePermissions(currentUser),
        assignableRoles: privilegeTargets.assignableRoles,
        resettableUserIds: privilegeTargets.manageableUserIds,
        integrations: await integrationConfigStatus(
          currentUser.organizationId,
        ),
      };
    },
  );
  const preference = result.data.notificationPreference;
  const resettableUserIds = new Set(result.data.resettableUserIds);
  const resettableUsers = result.data.users.filter((user) =>
    resettableUserIds.has(user.id),
  );
  const mailStatus = mailConfigStatus();

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
        <Section title="Můj kalendář">
          <form
            action={updateCalendarPreference}
            className="flex max-w-xl flex-col gap-4 sm:flex-row sm:items-end"
          >
            <Field label="Výchozí zobrazení kalendáře">
              <SelectInput
                name="calendarDefaultView"
                defaultValue={normalizeCalendarView(preference.calendarDefaultView)}
              >
                {calendarViewOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Button type="submit" pendingLabel="Ukládám…">Uložit kalendář</Button>
          </form>
        </Section>
      ) : null}
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
              <PreferenceCheckbox
                name="registryChangeEmail"
                label="Změna v rejstříku (ISIR/OR)"
                defaultChecked={preference.registryChangeEmail}
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
              <Button type="submit" pendingLabel="Ukládám…">Uložit notifikace</Button>
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
      {result.data.canManagePermissions ? (
        <Section title="Oprávnění">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-stone-600">
              Oprávnění rolí a výjimky uživatelů nastavíte v sekci Oprávnění.
            </p>
            <ButtonLink href="/settings/permissions" variant="secondary">
              Otevřít oprávnění
            </ButtonLink>
          </div>
        </Section>
      ) : null}
      {result.data.allowed ? (
        <>
          <Section title="Stav integrací">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-stone-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-stone-950">ARES</h3>
                  <Badge
                    tone={
                      result.data.integrations.aresEnabled ? "green" : "amber"
                    }
                  >
                    {result.data.integrations.aresEnabled
                      ? "Vyhledávání zapnuto"
                      : "Vyhledávání vypnuto"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-stone-600">
                  Veřejné REST API: {result.data.integrations.aresHost}
                </p>
              </div>
              <div className="rounded-lg border border-stone-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-stone-950">SharePoint</h3>
                  <Badge
                    tone={
                      result.data.integrations.graphConfigured &&
                      result.data.integrations.sharepointSiteConfigured
                        ? "green"
                        : result.data.integrations.sharepointSiteConfigured
                          ? "blue"
                          : "amber"
                    }
                  >
                    {result.data.integrations.graphConfigured &&
                    result.data.integrations.sharepointSiteConfigured
                      ? "Graph zápis aktivní"
                      : result.data.integrations.sharepointSiteConfigured
                        ? "Pouze URL režim"
                        : "Nenakonfigurováno"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-stone-600">
                  {result.data.integrations.sharepointHost
                    ? `Web: ${result.data.integrations.sharepointHost}. `
                    : "Web SharePointu není nastavený. "}
                  {result.data.integrations.graphConfigured
                    ? "Přihlašovací údaje Microsoft Graph jsou nastavené."
                    : "Pro zakládání složek a upload doplňte přihlašovací údaje Microsoft Graph."}
                </p>
                <Link
                  href="/settings/sharepoint"
                  className="mt-2 inline-block text-sm font-medium text-emerald-950 hover:underline"
                >
                  Nastavit připojení →
                </Link>
              </div>
              <div className="rounded-lg border border-stone-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-stone-950">E-mail (SMTP)</h3>
                  <Badge tone={mailStatus.enabled ? "green" : "amber"}>
                    {mailStatus.enabled
                      ? "Odesílání zapnuto"
                      : "Nenakonfigurováno"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-stone-600">
                  {mailStatus.enabled
                    ? "Pozvánky nových uživatelů a notifikace se odesílají e-mailem."
                    : `Bez SMTP aplikace neodešle pozvánky ani notifikace. Důvod: ${mailDisabledReasonLabel(mailStatus.reason)}.`}
                </p>
              </div>
            </div>
          </Section>
          <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
            <Section title="Uživatelé">
              {result.data.users.length > 0 ? (
                <div className="table-scroll">
                  <table className="w-max min-w-full table-auto">
                    <thead>
                      <tr>
                        <th>Jméno</th>
                        <th>E-mail</th>
                        <th>Role</th>
                        <th>Microsoft ID</th>
                        <th>Stav</th>
                        <th>Vytvořeno</th>
                        <th>Pozvánka</th>
                        <th>
                          <span className="sr-only">Akce</span>
                        </th>
                        {result.data.canManagePermissions ? (
                          <th>
                            <span className="sr-only">Oprávnění</span>
                          </th>
                        ) : null}
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
                          <td className="text-sm">
                            {invitationLabel(user.invitation)}
                          </td>
                          <td>
                            <ResendInvitationButton
                              userId={user.id}
                              userName={user.name}
                              disabled={
                                !user.active ||
                                user.id === result.data.currentUserId
                              }
                              disabledReason={
                                user.id === result.data.currentUserId
                                  ? "Sám sobě pozvánku neposíláte."
                                  : "Neaktivnímu uživateli se pozvánka neposílá."
                              }
                            />
                          </td>
                          {result.data.canManagePermissions ? (
                            <td>
                              <Link
                                href={`/settings/permissions/users/${user.id}`}
                                className="text-sm font-medium text-[#0e1822] underline-offset-2 hover:underline"
                                aria-label={`Oprávnění uživatele ${user.name}`}
                              >
                                Oprávnění
                              </Link>
                            </td>
                          ) : null}
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
              <CreateUserForm roles={result.data.assignableRoles} />
            </Section>
          </div>
          {resettableUsers.length > 0 ? (
            <Section title="Reset hesla uživatele">
              <form action={setUserPassword} className="grid max-w-sm gap-4">
                <Field label="Uživatel">
                  <SelectInput name="userId">
                    {resettableUsers.map((user) => (
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
