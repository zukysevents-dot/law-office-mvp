import type { Prisma } from "@/generated/prisma/client";
import { czechPlural } from "@/lib/plural";

// Řešitelé projektů a případů: osoby (ProjectAssignee / CaseAssignee) a celé
// právní týmy (ProjectTeamAssignment / CaseTeamAssignment). Čistý modul bez
// runtime importu Prismy — sdílí ho permissions.ts (viditelnost), filtry
// seznamů, server akce i unit testy.
//
// Členství v týmu je DYNAMICKÉ: přístup se odvozuje při každém dotazu z
// aktuálních LegalTeamMember řádků. Nový člen týmu tak přístup získá hned,
// odchodem z týmu ho ztratí. Archivovaný tým přístup nedává.

// --- Prisma where fragmenty --------------------------------------------------

// Přiřazení týmu, jehož je uživatel členem (tým nesmí být archivovaný).
// Stejný tvar pro ProjectTeamAssignment i CaseTeamAssignment.
export function teamMemberWhere(userId: string) {
  return {
    legalTeam: {
      is: { archivedAt: null, members: { some: { userId } } },
    },
  } satisfies Prisma.ProjectTeamAssignmentWhereInput &
    Prisma.CaseTeamAssignmentWhereInput;
}

// Projekt, ke kterému je přiřazen tým, jehož je uživatel členem.
export function projectTeamWhere(userId: string): Prisma.ProjectWhereInput {
  return { teamAssignments: { some: teamMemberWhere(userId) } };
}

// Případ, ke kterému je přiřazen tým, jehož je uživatel členem.
export function caseTeamWhere(userId: string): Prisma.CaseWhereInput {
  return { teamAssignments: { some: teamMemberWhere(userId) } };
}

// --- Selecty pro in-memory kontroly (canEditRecord / canViewRecord) ----------
//
// Každé místo, které volá canEditRecord/assertCanEditRecord nad projektem nebo
// případem, musí načíst i týmová přiřazení — jinak by advokát z přiřazeného
// týmu dostal „Nemáte oprávnění“. Lze použít v `include` i v `select`.

const activeTeamAssignments = {
  where: { legalTeam: { is: { archivedAt: null } } },
  select: {
    legalTeam: {
      select: { archivedAt: true, members: { select: { userId: true } } },
    },
  },
} as const;

export const projectAssignmentInclude = {
  assignees: { select: { userId: true } },
  teamAssignments: activeTeamAssignments,
} satisfies Prisma.ProjectInclude & Prisma.ProjectSelect;

export const caseAssignmentInclude = {
  assignees: { select: { userId: true } },
  teamAssignments: activeTeamAssignments,
} satisfies Prisma.CaseInclude & Prisma.CaseSelect;

// --- Parsování formulářových hodnot -------------------------------------------

export type AssigneeToken = { kind: "user" | "team"; id: string };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// "user:<id>" | "team:<id>" → token; cokoli jiného → null.
export function parseAssigneeToken(value: unknown): AssigneeToken | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(user|team):(.+)$/.exec(value.trim());
  if (!match || !ID_PATTERN.test(match[2])) {
    return null;
  }
  return { kind: match[1] as AssigneeToken["kind"], id: match[2] };
}

export const MAX_BULK_TARGETS = 500;

export type MatterTargets = { projectIds: string[]; caseIds: string[] };

// Hodnoty checkboxů hromadné tabulky ("project:<id>" / "case:<id>"). Duplicity
// a neznámé hodnoty se zahodí, celkový počet je omezen na MAX_BULK_TARGETS.
export function parseMatterTargets(values: readonly unknown[]): MatterTargets {
  const projectIds = new Set<string>();
  const caseIds = new Set<string>();
  for (const value of values) {
    if (projectIds.size + caseIds.size >= MAX_BULK_TARGETS) {
      break;
    }
    if (typeof value !== "string") {
      continue;
    }
    const match = /^(project|case):(.+)$/.exec(value.trim());
    if (!match || !ID_PATTERN.test(match[2])) {
      continue;
    }
    (match[1] === "project" ? projectIds : caseIds).add(match[2]);
  }
  return { projectIds: [...projectIds], caseIds: [...caseIds] };
}

// --- Filtr „Řešitel“ v seznamech ----------------------------------------------

export type AssigneeFilter =
  | { kind: "any" }
  | { kind: "me" }
  | { kind: "none" }
  | { kind: "some" }
  | { kind: "user"; id: string }
  | { kind: "team"; id: string };

// "" | "me" | "none" | "some" | "user:<id>" | "team:<id>"; neznámé → "any".
export function parseAssigneeFilter(value: unknown): AssigneeFilter {
  if (value === "me" || value === "none" || value === "some") {
    return { kind: value };
  }
  const token = parseAssigneeToken(value);
  return token ? { kind: token.kind, id: token.id } : { kind: "any" };
}

export function assigneeFilterValue(filter: AssigneeFilter): string {
  if (filter.kind === "any") {
    return "";
  }
  if (filter.kind === "user" || filter.kind === "team") {
    return `${filter.kind}:${filter.id}`;
  }
  return filter.kind;
}

function projectPersonWhere(userId: string): Prisma.ProjectWhereInput[] {
  return [
    { responsibleUserId: userId },
    { assignees: { some: { userId } } },
    projectTeamWhere(userId),
  ];
}

const noActiveTeam = { none: { legalTeam: { is: { archivedAt: null } } } };
const someActiveTeam = { some: { legalTeam: { is: { archivedAt: null } } } };

// Projekty podle řešitele. „Já“ / osoba = odpovědný, přímý řešitel nebo člen
// přiřazeného týmu. Viditelnost se skládá zvlášť (andWhere s visibility).
export function projectAssigneeFilterWhere(
  filter: AssigneeFilter,
  currentUserId: string,
): Prisma.ProjectWhereInput {
  switch (filter.kind) {
    case "me":
      return { OR: projectPersonWhere(currentUserId) };
    case "user":
      return { OR: projectPersonWhere(filter.id) };
    case "team":
      return { teamAssignments: { some: { legalTeamId: filter.id } } };
    case "none":
      return { assignees: { none: {} }, teamAssignments: noActiveTeam };
    case "some":
      return {
        OR: [{ assignees: { some: {} } }, { teamAssignments: someActiveTeam }],
      };
    default:
      return {};
  }
}

// Případy podle řešitele — počítají se i řešitelé projektu (případ vidí).
export function caseAssigneeFilterWhere(
  filter: AssigneeFilter,
  currentUserId: string,
): Prisma.CaseWhereInput {
  const personWhere = (userId: string): Prisma.CaseWhereInput => ({
    OR: [
      { responsibleUserId: userId },
      { assignees: { some: { userId } } },
      caseTeamWhere(userId),
      ...projectPersonWhere(userId).map(
        (where): Prisma.CaseWhereInput => ({ project: { is: where } }),
      ),
    ],
  });
  switch (filter.kind) {
    case "me":
      return personWhere(currentUserId);
    case "user":
      return personWhere(filter.id);
    case "team":
      return {
        OR: [
          { teamAssignments: { some: { legalTeamId: filter.id } } },
          {
            project: {
              is: { teamAssignments: { some: { legalTeamId: filter.id } } },
            },
          },
        ],
      };
    case "none":
      return {
        assignees: { none: {} },
        teamAssignments: noActiveTeam,
        project: {
          is: { assignees: { none: {} }, teamAssignments: noActiveTeam },
        },
      };
    case "some":
      return {
        OR: [
          { assignees: { some: {} } },
          { teamAssignments: someActiveTeam },
          { project: { is: { assignees: { some: {} } } } },
          { project: { is: { teamAssignments: someActiveTeam } } },
        ],
      };
    default:
      return {};
  }
}

// --- Notifikace o přiřazení ---------------------------------------------------

export type MatterKind = "project" | "case";

export type MatterRef = {
  kind: MatterKind;
  id: string;
  name: string;
  clientName?: string | null;
};

// Jedno vytvořené přiřazení: komu dává přístup a jestli přes tým.
export type AssignmentGrant = {
  matter: MatterRef;
  assignmentId: string;
  userIds: readonly string[];
  teamName: string | null;
};

export type RecipientItem = {
  matter: MatterRef;
  assignmentId: string;
  teamName: string | null;
};

export type RecipientNotice = { recipientId: string; items: RecipientItem[] };

// Z vytvořených přiřazení složí pro každého příjemce seznam záznamů: aktér se
// vynechá a záznam, ke kterému je někdo přiřazen přímo i přes tým, se počítá
// jednou (přímé přiřazení má přednost). Hromadná akce = jedna souhrnná
// notifikace na příjemce.
export function groupAssignmentNotifications(
  grants: readonly AssignmentGrant[],
  actorUserId: string | null | undefined,
): RecipientNotice[] {
  const byRecipient = new Map<string, Map<string, RecipientItem>>();
  for (const grant of grants) {
    const key = `${grant.matter.kind}:${grant.matter.id}`;
    for (const userId of grant.userIds) {
      if (!userId || userId === actorUserId) {
        continue;
      }
      const items = byRecipient.get(userId) ?? new Map<string, RecipientItem>();
      const existing = items.get(key);
      if (!existing || (existing.teamName && !grant.teamName)) {
        items.set(key, {
          matter: grant.matter,
          assignmentId: grant.assignmentId,
          teamName: grant.teamName,
        });
      }
      byRecipient.set(userId, items);
    }
  }
  return [...byRecipient.entries()].map(([recipientId, items]) => ({
    recipientId,
    items: [...items.values()],
  }));
}

export const NOTIFICATION_ITEM_LIMIT = 10;

function matterPath(matter: MatterRef) {
  return matter.kind === "project"
    ? `/projects/${matter.id}`
    : `/cases/${matter.id}`;
}

function matterGenitive(matter: MatterRef) {
  return matter.kind === "project" ? "projektu" : "případu";
}

function clientSuffix(matter: MatterRef) {
  return matter.clientName ? ` (klient ${matter.clientName})` : "";
}

function bulkNoun(items: readonly RecipientItem[]) {
  const kinds = new Set(items.map((item) => item.matter.kind));
  if (kinds.size > 1) {
    return "projektům a případům";
  }
  return kinds.has("project") ? "projektům" : "případům";
}

// Předmět a text notifikace MATTER_ASSIGNED pro jednoho příjemce. `link`
// převádí cestu aplikace na absolutní URL (appUrl z mailer.ts).
export function formatMatterAssignedNotification(
  items: readonly RecipientItem[],
  link: (path: string) => string,
): { subject: string; body: string; dedupeKey: string } {
  if (items.length === 1) {
    const [item] = items;
    const { matter } = item;
    const noun = matter.kind === "project" ? "projektu" : "případu";
    const message = item.teamName
      ? `Tým „${item.teamName}“, jehož jste členem, byl přidán mezi řešitele ${noun} „${matter.name}“${clientSuffix(matter)}.`
      : `Byli jste přidáni mezi řešitele ${noun} „${matter.name}“${clientSuffix(matter)}.`;
    return {
      subject: `Přiřazení k ${matterGenitive(matter)}: ${matter.name}`,
      body: [message, "", `Odkaz: ${link(matterPath(matter))}`].join("\n"),
      dedupeKey: `matter-assigned:${matter.kind}:${item.assignmentId}`,
    };
  }

  const teamNames = new Set(items.map((item) => item.teamName));
  const [onlyTeam] = [...teamNames];
  const intro =
    teamNames.size === 1 && onlyTeam
      ? `Tým „${onlyTeam}“, jehož jste členem, byl přidán mezi řešitele těchto záznamů:`
      : teamNames.size === 1
        ? "Byli jste přidáni mezi řešitele těchto záznamů:"
        : "Byli jste přidáni (osobně nebo přes tým) mezi řešitele těchto záznamů:";
  const shown = items.slice(0, NOTIFICATION_ITEM_LIMIT).map((item) => {
    const label = item.matter.kind === "project" ? "Projekt" : "Případ";
    return `- ${label} „${item.matter.name}“${clientSuffix(item.matter)}: ${link(matterPath(item.matter))}`;
  });
  const rest = items.length - shown.length;
  return {
    subject: `Přiřazení k ${items.length} ${bulkNoun(items)}`,
    body: [
      intro,
      "",
      ...shown,
      ...(rest > 0 ? [`… a další (${rest})`] : []),
    ].join("\n"),
    dedupeKey: `matter-assigned:bulk:${items[0].assignmentId}`,
  };
}

// Notifikace novému členovi týmu.
export function formatTeamJoinedNotification(
  input: { teamName: string; projectCount: number; caseCount: number },
  link: (path: string) => string,
): { subject: string; body: string } {
  const { teamName, projectCount, caseCount } = input;
  const scope =
    projectCount + caseCount === 0
      ? "Tým zatím není řešitelem žádného projektu ani případu."
      : `Tým je řešitelem ${projectCount} ${czechPlural(projectCount, ["projektu", "projektů", "projektů"])} a ${caseCount} ${czechPlural(caseCount, ["případu", "případů", "případů"])} – najdete je v seznamu Projekty s filtrem Řešitel: Já.`;
  return {
    subject: `Přidání do týmu: ${teamName}`,
    body: [
      `Byli jste přidáni do týmu „${teamName}“. ${scope}`,
      "",
      `Odkaz: ${link("/projects?assignee=me")}`,
    ].join("\n"),
  };
}

// --- Zobrazení přiřazených týmů ------------------------------------------------

// Přiřazené (nearchivované) týmy s členy pro detail projektu/případu a seznamy.
// Obsahuje i archivedAt a members.userId, takže záznam načtený s tímto selectem
// projde i canEditRecord / canViewRecord.
export const teamAssignmentDisplaySelect = {
  where: { legalTeam: { is: { archivedAt: null } } },
  orderBy: { assignedAt: "asc" },
  select: {
    id: true,
    legalTeam: {
      select: {
        id: true,
        name: true,
        archivedAt: true,
        members: {
          orderBy: { user: { name: "asc" } },
          select: { userId: true, user: { select: { id: true, name: true } } },
        },
      },
    },
  },
} as const;

// Přímí řešitelé (osoby) pro zobrazení.
export const personAssigneeDisplaySelect = {
  orderBy: { assignedAt: "asc" },
  select: { id: true, userId: true, user: { select: { id: true, name: true } } },
} as const;

type DisplayTeam = { legalTeam: { name: string } };
type DisplayPerson = { user: { name: string } };

// Krátký popis řešitelů do buňky tabulky: „Tým Spory · Advokát Demo“, nejvýš
// `limit` položek a „+N“.
export function assigneeLabels(
  teams: readonly DisplayTeam[],
  people: readonly DisplayPerson[],
): string[] {
  return [
    ...teams.map((team) => `Tým ${team.legalTeam.name}`),
    ...people.map((person) => person.user.name),
  ];
}

export function summarizeLabels(labels: readonly string[], limit = 3) {
  const shown = labels.slice(0, limit);
  const rest = labels.length - shown.length;
  return { shown, rest };
}

// Řádek tabulky „Řešitelé projektů a případů“ (/settings/assignments).
export type AssignmentRowTeam = { name: string; members: string[] };

export type AssignmentRow = {
  // "project:<id>" | "case:<id>" — hodnota odesílaná hromadné akci.
  key: string;
  kind: MatterKind;
  href: string;
  title: string;
  // U případu název projektu (zobrazení „Projekt › Případ“).
  projectName: string | null;
  clientName: string;
  responsibleName: string | null;
  teams: AssignmentRowTeam[];
  people: string[];
  // U případu řešitelé projektu (vidí případ díky přiřazení k projektu).
  inheritedTeams: AssignmentRowTeam[];
  inheritedPeople: string[];
  editable: boolean;
};
