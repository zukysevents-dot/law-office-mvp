import { HrNewsAudience, UserRole } from "@/generated/prisma/enums";

// Čistá logika aktualit v HR (bez DB): validace adresátů z formuláře, shoda
// adresátů s uživatelem (zrcadlí hrNewsTargetWhere v permissions.ts), platnost
// a popisek „Pro koho“.

export const NEWS_TITLE_MAX = 200;
export const NEWS_BODY_MAX = 5000;
export const NEWS_MAX_RECIPIENTS = 200;

export type NewsAudienceInput = {
  audience: string | null;
  roles: string[];
  userIds: string[];
};

export type NewsAudience = {
  audience: HrNewsAudience;
  roles: UserRole[];
  userIds: string[];
};

// Adresáti z formuláře. Pro „role“ musí být vybraná aspoň jedna platná role,
// pro „konkrétní lidi“ aspoň jeden člověk; ostatní pole se zahodí, aby
// v DB nezůstaly nesouvisející hodnoty. Neznámý typ → celá kancelář.
export function parseNewsAudience(input: NewsAudienceInput): NewsAudience {
  const audience = (Object.values(HrNewsAudience) as string[]).includes(
    input.audience ?? "",
  )
    ? (input.audience as HrNewsAudience)
    : HrNewsAudience.ALL;

  if (audience === HrNewsAudience.ROLES) {
    const roles = [
      ...new Set(
        input.roles.filter((role): role is UserRole =>
          (Object.values(UserRole) as string[]).includes(role),
        ),
      ),
    ];
    if (roles.length === 0) {
      throw new Error("Vyberte aspoň jednu roli, pro kterou je aktualita určena.");
    }
    return { audience, roles, userIds: [] };
  }

  if (audience === HrNewsAudience.USERS) {
    const userIds = [...new Set(input.userIds.filter(Boolean))];
    if (userIds.length === 0) {
      throw new Error("Vyberte aspoň jednoho kolegu, pro kterého je aktualita určena.");
    }
    if (userIds.length > NEWS_MAX_RECIPIENTS) {
      throw new Error("Příliš mnoho příjemců.");
    }
    return { audience, roles: [], userIds };
  }

  return { audience: HrNewsAudience.ALL, roles: [], userIds: [] };
}

export function validateNewsText(title: string, body: string) {
  if (title.length > NEWS_TITLE_MAX) {
    throw new Error(`Nadpis může mít nejvýš ${NEWS_TITLE_MAX} znaků.`);
  }
  if (body.length > NEWS_BODY_MAX) {
    throw new Error(`Text aktuality může mít nejvýš ${NEWS_BODY_MAX} znaků.`);
  }
}

// Sjednotí konce řádků (CRLF z formuláře) a odřízne prázdné řádky na konci.
// Zalomení uvnitř textu zůstávají — stránka je zobrazí (whitespace-pre-line).
export function normalizeNewsBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(/\s+$/u, "");
}

type TargetableNews = {
  audience: HrNewsAudience;
  audienceRoles: readonly UserRole[];
  recipients: ReadonlyArray<{ userId: string }>;
};

// Je aktualita určená uživateli? Stejná pravidla jako hrNewsTargetWhere.
export function isNewsTargetedTo(
  news: TargetableNews,
  user: { id: string; role: UserRole },
): boolean {
  switch (news.audience) {
    case HrNewsAudience.ALL:
      return true;
    case HrNewsAudience.ROLES:
      return news.audienceRoles.includes(user.role);
    case HrNewsAudience.USERS:
      return news.recipients.some((recipient) => recipient.userId === user.id);
    default:
      return false;
  }
}

// Aktualita se na dashboardu ukazuje do konce dne `visibleUntil` (date-only,
// UTC půlnoc kancelářského dne) včetně. `officeToday` = officeWorkDate(now).
export function isNewsActive(
  news: { archivedAt?: Date | null; visibleUntil?: Date | null },
  officeToday: Date,
): boolean {
  if (news.archivedAt) {
    return false;
  }
  if (!news.visibleUntil) {
    return true;
  }
  return news.visibleUntil.getTime() >= officeToday.getTime();
}

// Prisma fragment „platná k datu“ (doplňuje isNewsActive pro dotazy).
export function activeNewsWhere(officeToday: Date) {
  return {
    archivedAt: null,
    OR: [{ visibleUntil: null }, { visibleUntil: { gte: officeToday } }],
  };
}

// Popisek „Pro koho“: „Celá kancelář“, „Role: Partner, Advokát“, „Vybraní
// kolegové: Jan Novák, Eva Malá“.
export function newsAudienceSummary(
  news: {
    audience: HrNewsAudience;
    audienceRoles: readonly UserRole[];
    recipients: ReadonlyArray<{ user: { name: string } | null }>;
  },
  roleLabels: Record<UserRole, string>,
): string {
  if (news.audience === HrNewsAudience.ROLES) {
    const roles = Object.values(UserRole).filter((role) =>
      news.audienceRoles.includes(role),
    );
    return `Role: ${roles.map((role) => roleLabels[role]).join(", ") || "—"}`;
  }
  if (news.audience === HrNewsAudience.USERS) {
    const names = news.recipients
      .map((recipient) => recipient.user?.name)
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b, "cs"));
    return `Vybraní kolegové: ${names.join(", ") || "—"}`;
  }
  return "Celá kancelář";
}
