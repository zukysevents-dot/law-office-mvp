import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { OrganizationMemberStatus } from "@/generated/prisma/enums";
import {
  caseAssigneeFilterWhere,
  personAssigneeDisplaySelect,
  projectAssigneeFilterWhere,
  teamAssignmentDisplaySelect,
  type AssigneeFilter,
  type AssignmentRow,
} from "@/lib/assignments";
import type { getCurrentUser } from "@/lib/auth";
import { canAccessModule } from "@/lib/module-access.server";
import {
  andWhere,
  canEditRecord,
  caseVisibilityWhere,
  projectVisibilityWhere,
} from "@/lib/permissions";
import type { getPrisma } from "@/lib/prisma";

type Db = ReturnType<typeof getPrisma>;
type Actor = Awaited<ReturnType<typeof getCurrentUser>>;

// Aktivní týmy kanceláře pro výběr řešitele (detail, seznamy, zakládání).
export async function getTeamOptions(prisma: Db, organizationId: string | null) {
  if (!organizationId) {
    return [];
  }
  const teams = await prisma.legalTeam.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { members: true } } },
  });
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    memberCount: team._count.members,
  }));
}

// Aktivní týmy i s id aktivních členů (aktivní účet + aktivní členství
// v kanceláři) — výběr řešitelů/dohledu úkolu, kde se tým rozbalí na osoby.
export async function getTeamOptionsWithMembers(
  prisma: Db,
  organizationId: string | null,
) {
  if (!organizationId) {
    return [];
  }
  const teams = await prisma.legalTeam.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      members: {
        where: {
          organizationId,
          user: {
            is: {
              active: true,
              memberships: {
                some: {
                  organizationId,
                  status: OrganizationMemberStatus.ACTIVE,
                },
              },
            },
          },
        },
        orderBy: { user: { name: "asc" } },
        select: { userId: true },
      },
    },
  });
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    memberCount: team.members.length,
    memberIds: team.members.map((member) => member.userId),
  }));
}

export const OVERVIEW_ROW_LIMIT = 300;

export type OverviewFilters = {
  q: string;
  show: "all" | "projects" | "cases";
  teamId: string;
  userId: string;
  state: "all" | "none" | "some";
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function readOverviewFilters(params: {
  q?: string;
  show?: string;
  team?: string;
  user?: string;
  state?: string;
}): OverviewFilters {
  const id = (value: string | undefined) =>
    value && ID_PATTERN.test(value) ? value : "";
  return {
    q: params.q?.trim().slice(0, 200) ?? "",
    show:
      params.show === "projects" || params.show === "cases" ? params.show : "all",
    teamId: id(params.team),
    userId: id(params.user),
    state: params.state === "none" || params.state === "some" ? params.state : "all",
  };
}

function filterList(filters: OverviewFilters): AssigneeFilter[] {
  return [
    ...(filters.teamId ? [{ kind: "team" as const, id: filters.teamId }] : []),
    ...(filters.userId ? [{ kind: "user" as const, id: filters.userId }] : []),
    ...(filters.state !== "all" ? [{ kind: filters.state }] : []),
  ];
}

type DisplayTeam = {
  legalTeam: { name: string; members: Array<{ user: { name: string } }> };
};

function teamsOf(rows: readonly DisplayTeam[]) {
  return rows.map((row) => ({
    name: row.legalTeam.name,
    members: row.legalTeam.members.map((member) => member.user.name),
  }));
}

function byClientThenTitle(a: AssignmentRow, b: AssignmentRow) {
  return (
    a.clientName.localeCompare(b.clientName, "cs") ||
    (a.projectName ?? a.title).localeCompare(b.projectName ?? b.title, "cs") ||
    (a.projectName ? 1 : 0) - (b.projectName ? 1 : 0) ||
    a.title.localeCompare(b.title, "cs")
  );
}

// Řádky centrální tabulky řešitelů: aktivní projekty a případy, které aktér
// vidí (visibility + modul), s přiřazenými osobami a týmy.
export async function loadAssignmentOverview(
  prisma: Db,
  actor: Actor,
  filters: OverviewFilters,
): Promise<{ rows: AssignmentRow[]; truncated: boolean }> {
  const [projectsAllowed, casesAllowed] = await Promise.all([
    filters.show !== "cases" ? canAccessModule(actor, "module.projects") : false,
    filters.show !== "projects" ? canAccessModule(actor, "module.cases") : false,
  ]);
  const assigneeFilters = filterList(filters);
  const q = filters.q;
  const take = OVERVIEW_ROW_LIMIT + 1;

  const projectSearch: Prisma.ProjectWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { mainSubject: { name: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};
  const caseSearch: Prisma.CaseWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { fileNumber: { contains: q, mode: "insensitive" } },
          { project: { name: { contains: q, mode: "insensitive" } } },
          {
            project: {
              mainSubject: { name: { contains: q, mode: "insensitive" } },
            },
          },
        ],
      }
    : {};

  const [projects, cases] = await Promise.all([
    projectsAllowed
      ? prisma.project.findMany({
          where: andWhere<Prisma.ProjectWhereInput>(
            { archivedAt: null },
            projectVisibilityWhere(actor),
            projectSearch,
            ...assigneeFilters.map((filter) =>
              projectAssigneeFilterWhere(filter, actor.id),
            ),
          ),
          orderBy: [{ mainSubject: { name: "asc" } }, { name: "asc" }],
          take,
          select: {
            id: true,
            name: true,
            organizationId: true,
            responsibleUserId: true,
            mainSubject: { select: { name: true } },
            responsibleUser: { select: { name: true } },
            assignees: personAssigneeDisplaySelect,
            teamAssignments: teamAssignmentDisplaySelect,
          },
        })
      : [],
    casesAllowed
      ? prisma.case.findMany({
          where: andWhere<Prisma.CaseWhereInput>(
            { archivedAt: null },
            caseVisibilityWhere(actor),
            caseSearch,
            ...assigneeFilters.map((filter) =>
              caseAssigneeFilterWhere(filter, actor.id),
            ),
          ),
          orderBy: [
            { project: { mainSubject: { name: "asc" } } },
            { project: { name: "asc" } },
            { name: "asc" },
          ],
          take,
          select: {
            id: true,
            name: true,
            fileNumber: true,
            organizationId: true,
            responsibleUserId: true,
            responsibleUser: { select: { name: true } },
            assignees: personAssigneeDisplaySelect,
            teamAssignments: teamAssignmentDisplaySelect,
            project: {
              select: {
                name: true,
                mainSubject: { select: { name: true } },
                assignees: personAssigneeDisplaySelect,
                teamAssignments: teamAssignmentDisplaySelect,
              },
            },
          },
        })
      : [],
  ]);

  const rows: AssignmentRow[] = [
    ...projects.map((project) => ({
      key: `project:${project.id}`,
      kind: "project" as const,
      href: `/projects/${project.id}`,
      title: project.name,
      projectName: null,
      clientName: project.mainSubject.name,
      responsibleName: project.responsibleUser?.name ?? null,
      teams: teamsOf(project.teamAssignments),
      people: project.assignees.map((row) => row.user.name),
      inheritedTeams: [],
      inheritedPeople: [],
      editable: canEditRecord(actor, "Project", project),
    })),
    ...cases.map((legalCase) => ({
      key: `case:${legalCase.id}`,
      kind: "case" as const,
      href: `/cases/${legalCase.id}`,
      title: legalCase.fileNumber
        ? `${legalCase.name} (${legalCase.fileNumber})`
        : legalCase.name,
      projectName: legalCase.project.name,
      clientName: legalCase.project.mainSubject.name,
      responsibleName: legalCase.responsibleUser?.name ?? null,
      teams: teamsOf(legalCase.teamAssignments),
      people: legalCase.assignees.map((row) => row.user.name),
      inheritedTeams: teamsOf(legalCase.project.teamAssignments),
      inheritedPeople: legalCase.project.assignees.map((row) => row.user.name),
      editable: canEditRecord(actor, "Case", legalCase),
    })),
  ].sort(byClientThenTitle);

  return {
    rows: rows.slice(0, OVERVIEW_ROW_LIMIT),
    truncated: rows.length > OVERVIEW_ROW_LIMIT,
  };
}
