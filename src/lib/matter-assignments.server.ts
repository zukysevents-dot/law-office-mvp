import "server-only";

import { OrganizationMemberStatus } from "@/generated/prisma/enums";
import {
  caseAssignmentInclude,
  groupAssignmentNotifications,
  projectAssignmentInclude,
  type AssigneeToken,
  type AssignmentGrant,
  type MatterKind,
  type MatterRef,
  type MatterTargets,
} from "@/lib/assignments";
import { auditCreateData } from "@/lib/audit";
import type { getCurrentUser } from "@/lib/auth";
import { canAccessModule } from "@/lib/module-access.server";
import { queueMatterAssignedNotifications } from "@/lib/notifications/notification-service";
import { assertUserInOrg } from "@/lib/org-users";
import {
  andWhere,
  assertCanEditRecord,
  canEditRecord,
  caseVisibilityWhere,
  projectVisibilityWhere,
} from "@/lib/permissions";
import type { getPrisma } from "@/lib/prisma";

// Jádro přiřazování řešitelů (osob i týmů) k projektům a případům. Sdílí ho
// detail projektu/případu, zakládání projektu/případu i hromadná akce na
// /settings/assignments. Vše je org-scoped, idempotentní (unikátní indexy +
// skipDuplicates), každá změna má audit a nové přiřazení pošle notifikaci.

type Actor = Awaited<ReturnType<typeof getCurrentUser>>;
type Db = ReturnType<typeof getPrisma>;

export type EditableMatter = MatterRef & {
  organizationId: string;
  // U případu: projekt (pro revalidaci detailu projektu).
  projectId: string | null;
};

export type ResolvedAssignee =
  | { kind: "user"; id: string; name: string }
  | { kind: "team"; id: string; name: string };

// Jeden projekt/případ, který aktér vidí a smí upravit (detail stránky).
export async function loadEditableMatter(
  prisma: Db,
  actor: Actor,
  kind: MatterKind,
  id: string,
): Promise<EditableMatter> {
  if (kind === "project") {
    const project = await prisma.project.findFirst({
      where: andWhere({ id }, projectVisibilityWhere(actor)),
      include: {
        ...projectAssignmentInclude,
        mainSubject: { select: { name: true } },
      },
    });
    if (!project) {
      throw new Error("Projekt nenalezen nebo k němu nemáte oprávnění.");
    }
    assertCanEditRecord(actor, "Project", project);
    return {
      kind,
      id: project.id,
      name: project.name,
      clientName: project.mainSubject.name,
      organizationId: project.organizationId,
      projectId: null,
    };
  }

  const legalCase = await prisma.case.findFirst({
    where: andWhere({ id }, caseVisibilityWhere(actor)),
    include: {
      ...caseAssignmentInclude,
      project: { select: { mainSubject: { select: { name: true } } } },
    },
  });
  if (!legalCase) {
    throw new Error("Případ nenalezen nebo k němu nemáte oprávnění.");
  }
  assertCanEditRecord(actor, "Case", legalCase);
  return {
    kind,
    id: legalCase.id,
    name: legalCase.name,
    clientName: legalCase.project.mainSubject.name,
    organizationId: legalCase.organizationId,
    projectId: legalCase.projectId,
  };
}

// Hromadný výběr: vrátí jen záznamy, které aktér vidí, smí upravit a k jejichž
// modulu má přístup. Ostatní se počítají jako přeskočené.
export async function loadEditableMatters(
  prisma: Db,
  actor: Actor,
  targets: MatterTargets,
): Promise<{ matters: EditableMatter[]; skipped: number }> {
  const [projectsAllowed, casesAllowed] = await Promise.all([
    targets.projectIds.length > 0
      ? canAccessModule(actor, "module.projects")
      : false,
    targets.caseIds.length > 0 ? canAccessModule(actor, "module.cases") : false,
  ]);

  const [projects, cases] = await Promise.all([
    projectsAllowed
      ? prisma.project.findMany({
          where: andWhere(
            { id: { in: targets.projectIds } },
            projectVisibilityWhere(actor),
          ),
          include: {
            ...projectAssignmentInclude,
            mainSubject: { select: { name: true } },
          },
        })
      : [],
    casesAllowed
      ? prisma.case.findMany({
          where: andWhere(
            { id: { in: targets.caseIds } },
            caseVisibilityWhere(actor),
          ),
          include: {
            ...caseAssignmentInclude,
            project: { select: { mainSubject: { select: { name: true } } } },
          },
        })
      : [],
  ]);

  const matters: EditableMatter[] = [
    ...projects
      .filter((project) => canEditRecord(actor, "Project", project))
      .map((project) => ({
        kind: "project" as const,
        id: project.id,
        name: project.name,
        clientName: project.mainSubject.name,
        organizationId: project.organizationId,
        projectId: null,
      })),
    ...cases
      .filter((legalCase) => canEditRecord(actor, "Case", legalCase))
      .map((legalCase) => ({
        kind: "case" as const,
        id: legalCase.id,
        name: legalCase.name,
        clientName: legalCase.project.mainSubject.name,
        organizationId: legalCase.organizationId,
        projectId: legalCase.projectId,
      })),
  ];
  const requested = targets.projectIds.length + targets.caseIds.length;
  return { matters, skipped: requested - matters.length };
}

// Ověří, že osoba je aktivním členem kanceláře aktéra, resp. že tým patří do
// kanceláře a není archivovaný.
export async function resolveAssignee(
  prisma: Db,
  actor: Actor,
  token: AssigneeToken,
): Promise<ResolvedAssignee> {
  if (token.kind === "user") {
    await assertUserInOrg(token.id, actor.organizationId);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: token.id },
      select: { id: true, name: true },
    });
    return { kind: "user", id: user.id, name: user.name };
  }
  const team = await prisma.legalTeam.findFirst({
    where: {
      id: token.id,
      organizationId: actor.organizationId,
      archivedAt: null,
    },
    select: { id: true, name: true },
  });
  if (!team) {
    throw new Error("Tým nebyl nalezen nebo je archivovaný.");
  }
  return { kind: "team", id: team.id, name: team.name };
}

// Aktivní členové týmu (aktivní účet + aktivní členství v kanceláři) — jen ti
// dostanou notifikaci.
async function activeTeamMemberIds(
  prisma: Db,
  organizationId: string,
  legalTeamId: string,
) {
  const rows = await prisma.legalTeamMember.findMany({
    where: {
      legalTeamId,
      organizationId,
      user: {
        is: {
          active: true,
          memberships: {
            some: { organizationId, status: OrganizationMemberStatus.ACTIVE },
          },
        },
      },
    },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

export type AssignResult = {
  created: Array<{ matter: EditableMatter; assignmentId: string }>;
};

function entityTypeFor(kind: MatterKind, assignee: ResolvedAssignee) {
  if (assignee.kind === "user") {
    return kind === "project" ? "ProjectAssignee" : "CaseAssignee";
  }
  return kind === "project" ? "ProjectTeamAssignment" : "CaseTeamAssignment";
}

function assigneeAuditValue(
  matter: EditableMatter,
  assignee: ResolvedAssignee,
  bulk: boolean,
) {
  return {
    ...(matter.kind === "project"
      ? { projectId: matter.id }
      : { caseId: matter.id }),
    ...(assignee.kind === "user"
      ? { userId: assignee.id }
      : { legalTeamId: assignee.id, teamName: assignee.name }),
    ...(bulk ? { bulk: true } : {}),
  };
}

// Přiřadí osobu nebo tým k záznamům. Už existující přiřazení se tiše přeskočí.
// Audit se zapisuje v téže transakci jen pro skutečně vložené řádky; notifikace
// až po commitu.
export async function assignToMatters(
  prisma: Db,
  actor: Actor,
  matters: readonly EditableMatter[],
  assignee: ResolvedAssignee,
  options: { bulk?: boolean } = {},
): Promise<AssignResult> {
  const organizationId = actor.organizationId;
  const own = matters.filter((matter) => matter.organizationId === organizationId);
  const projects = own.filter((matter) => matter.kind === "project");
  const cases = own.filter((matter) => matter.kind === "case");
  const byKey = new Map(own.map((matter) => [`${matter.kind}:${matter.id}`, matter]));
  const base = { organizationId, assignedById: actor.id };

  const created = await prisma.$transaction(async (tx) => {
    const rows: Array<{ kind: MatterKind; matterId: string; id: string }> = [];
    if (assignee.kind === "user") {
      if (projects.length > 0) {
        const inserted = await tx.projectAssignee.createManyAndReturn({
          data: projects.map((m) => ({ ...base, projectId: m.id, userId: assignee.id })),
          skipDuplicates: true,
          select: { id: true, projectId: true },
        });
        rows.push(...inserted.map((r) => ({ kind: "project" as const, matterId: r.projectId, id: r.id })));
      }
      if (cases.length > 0) {
        const inserted = await tx.caseAssignee.createManyAndReturn({
          data: cases.map((m) => ({ ...base, caseId: m.id, userId: assignee.id })),
          skipDuplicates: true,
          select: { id: true, caseId: true },
        });
        rows.push(...inserted.map((r) => ({ kind: "case" as const, matterId: r.caseId, id: r.id })));
      }
    } else {
      if (projects.length > 0) {
        const inserted = await tx.projectTeamAssignment.createManyAndReturn({
          data: projects.map((m) => ({ ...base, projectId: m.id, legalTeamId: assignee.id })),
          skipDuplicates: true,
          select: { id: true, projectId: true },
        });
        rows.push(...inserted.map((r) => ({ kind: "project" as const, matterId: r.projectId, id: r.id })));
      }
      if (cases.length > 0) {
        const inserted = await tx.caseTeamAssignment.createManyAndReturn({
          data: cases.map((m) => ({ ...base, caseId: m.id, legalTeamId: assignee.id })),
          skipDuplicates: true,
          select: { id: true, caseId: true },
        });
        rows.push(...inserted.map((r) => ({ kind: "case" as const, matterId: r.caseId, id: r.id })));
      }
    }

    const result = rows.flatMap((row) => {
      const matter = byKey.get(`${row.kind}:${row.matterId}`);
      return matter ? [{ matter, assignmentId: row.id }] : [];
    });
    if (result.length > 0) {
      await tx.auditLog.createMany({
        data: result.map(({ matter, assignmentId }) =>
          auditCreateData({
            organizationId,
            entityType: entityTypeFor(matter.kind, assignee),
            entityId: assignmentId,
            action: "CREATE",
            changedById: actor.id,
            newValue: assigneeAuditValue(matter, assignee, Boolean(options.bulk)),
          }),
        ),
      });
    }
    return result;
  });

  if (created.length > 0) {
    await notifyAssigned(prisma, actor, created, assignee);
  }
  return { created };
}

async function notifyAssigned(
  prisma: Db,
  actor: Actor,
  created: AssignResult["created"],
  assignee: ResolvedAssignee,
) {
  // Notifikace je vedlejší efekt: přiřazení je už uložené, chyba při zařazení
  // e-mailu ho nesmí zvrátit ani ukázat uživateli chybovou stránku.
  try {
    const userIds =
      assignee.kind === "user"
        ? [assignee.id]
        : await activeTeamMemberIds(prisma, actor.organizationId, assignee.id);
    const grants: AssignmentGrant[] = created.map(({ matter, assignmentId }) => ({
      matter: {
        kind: matter.kind,
        id: matter.id,
        name: matter.name,
        clientName: matter.clientName,
      },
      assignmentId,
      userIds,
      teamName: assignee.kind === "team" ? assignee.name : null,
    }));
    await queueMatterAssignedNotifications({
      notices: groupAssignmentNotifications(grants, actor.id),
      actorUserId: actor.id,
    });
  } catch (error) {
    console.error("Notifikaci o přiřazení se nepodařilo zařadit.", error);
  }
}

// Odebere osobu nebo tým ze záznamů. Odpovědnou osobu (responsibleUserId)
// nemění. Vrací počet skutečně odebraných přiřazení.
export async function unassignFromMatters(
  prisma: Db,
  actor: Actor,
  matters: readonly EditableMatter[],
  assignee: ResolvedAssignee,
  options: { bulk?: boolean } = {},
): Promise<number> {
  const organizationId = actor.organizationId;
  const own = matters.filter((matter) => matter.organizationId === organizationId);
  const projectIds = own.filter((m) => m.kind === "project").map((m) => m.id);
  const caseIds = own.filter((m) => m.kind === "case").map((m) => m.id);
  const byKey = new Map(own.map((matter) => [`${matter.kind}:${matter.id}`, matter]));

  return prisma.$transaction(async (tx) => {
    const removed: Array<{ kind: MatterKind; matterId: string; id: string }> = [];
    if (assignee.kind === "user") {
      const projectRows = projectIds.length
        ? await tx.projectAssignee.findMany({
            where: { organizationId, projectId: { in: projectIds }, userId: assignee.id },
            select: { id: true, projectId: true },
          })
        : [];
      const caseRows = caseIds.length
        ? await tx.caseAssignee.findMany({
            where: { organizationId, caseId: { in: caseIds }, userId: assignee.id },
            select: { id: true, caseId: true },
          })
        : [];
      if (projectRows.length) {
        await tx.projectAssignee.deleteMany({
          where: { id: { in: projectRows.map((r) => r.id) } },
        });
      }
      if (caseRows.length) {
        await tx.caseAssignee.deleteMany({
          where: { id: { in: caseRows.map((r) => r.id) } },
        });
      }
      removed.push(
        ...projectRows.map((r) => ({ kind: "project" as const, matterId: r.projectId, id: r.id })),
        ...caseRows.map((r) => ({ kind: "case" as const, matterId: r.caseId, id: r.id })),
      );
    } else {
      const projectRows = projectIds.length
        ? await tx.projectTeamAssignment.findMany({
            where: { organizationId, projectId: { in: projectIds }, legalTeamId: assignee.id },
            select: { id: true, projectId: true },
          })
        : [];
      const caseRows = caseIds.length
        ? await tx.caseTeamAssignment.findMany({
            where: { organizationId, caseId: { in: caseIds }, legalTeamId: assignee.id },
            select: { id: true, caseId: true },
          })
        : [];
      if (projectRows.length) {
        await tx.projectTeamAssignment.deleteMany({
          where: { id: { in: projectRows.map((r) => r.id) } },
        });
      }
      if (caseRows.length) {
        await tx.caseTeamAssignment.deleteMany({
          where: { id: { in: caseRows.map((r) => r.id) } },
        });
      }
      removed.push(
        ...projectRows.map((r) => ({ kind: "project" as const, matterId: r.projectId, id: r.id })),
        ...caseRows.map((r) => ({ kind: "case" as const, matterId: r.caseId, id: r.id })),
      );
    }

    const audit = removed.flatMap((row) => {
      const matter = byKey.get(`${row.kind}:${row.matterId}`);
      return matter
        ? [
            auditCreateData({
              organizationId,
              entityType: entityTypeFor(matter.kind, assignee),
              entityId: row.id,
              action: "DELETE",
              changedById: actor.id,
              oldValue: assigneeAuditValue(matter, assignee, Boolean(options.bulk)),
            }),
          ]
        : [];
    });
    if (audit.length > 0) {
      await tx.auditLog.createMany({ data: audit });
    }
    return removed.length;
  });
}

// Cesty, které po změně řešitelů musí přerenderovat (seznamy, detaily,
// centrální stránka).
export function assignmentRevalidationPaths(
  matters: readonly EditableMatter[],
): string[] {
  const paths = new Set(["/projects", "/cases", "/settings/assignments", "/dashboard"]);
  for (const matter of matters) {
    if (matter.kind === "project") {
      paths.add(`/projects/${matter.id}`);
    } else {
      paths.add(`/cases/${matter.id}`);
      if (matter.projectId) {
        paths.add(`/projects/${matter.projectId}`);
      }
    }
  }
  return [...paths];
}
