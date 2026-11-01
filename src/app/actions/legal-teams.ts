"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { OrganizationMemberStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { queueTeamJoinedNotification } from "@/lib/notifications/notification-service";
import { assertCanAdministerOrg } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Právní týmy kanceláře. Správa týmů patří k nastavení kanceláře („Spravuje
// nastavení kanceláře“). Členství je dynamické: kdo je v týmu, vidí vše, k čemu
// je tým přiřazen (src/lib/assignments.ts) — proto se po každé změně členství
// nebo archivaci přerenderuje celá aplikace.

export type TeamFormState = {
  ok: boolean;
  message?: string;
  error?: string;
  // Mění se při každém odeslání — klient podle ní zavře dialog / vyprázdní pole.
  version: number;
};

const TEAM_NAME_MAX = 120;

function done(message: string): TeamFormState {
  return { ok: true, message, version: Date.now() };
}

function failed(error: string): TeamFormState {
  return { ok: false, error, version: Date.now() };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Uložení se nezdařilo.";
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function authorize() {
  const currentUser = await getCurrentUser();
  assertCanAdministerOrg(currentUser, currentUser.organizationId);
  return currentUser;
}

function teamName(formData: FormData) {
  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) {
    throw new Error("Zadejte název týmu.");
  }
  return name.slice(0, TEAM_NAME_MAX);
}

function revalidateTeams() {
  // Členství a archivace mění viditelnost projektů/případů napříč aplikací.
  revalidatePath("/", "layout");
}

async function findTeam(organizationId: string, legalTeamId: string) {
  const team = await getPrisma().legalTeam.findFirst({
    where: { id: legalTeamId, organizationId },
  });
  if (!team) {
    throw new Error("Tým nebyl nalezen.");
  }
  return team;
}

export async function createLegalTeam(
  _previous: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  try {
    const actor = await authorize();
    const organizationId = actor.organizationId;
    const name = teamName(formData);
    const prisma = getPrisma();
    let team;
    try {
      team = await prisma.legalTeam.create({ data: { organizationId, name } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return failed("Tým s tímto názvem už existuje.");
      }
      throw error;
    }
    await writeAuditLog({
      organizationId,
      entityType: "LegalTeam",
      entityId: team.id,
      action: "CREATE",
      changedById: actor.id,
      newValue: { name },
    });
    revalidateTeams();
    return done(`Tým „${name}“ byl vytvořen.`);
  } catch (error) {
    return failed(errorMessage(error));
  }
}

export async function renameLegalTeam(
  _previous: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  try {
    const actor = await authorize();
    const organizationId = actor.organizationId;
    const team = await findTeam(organizationId, requiredString(formData, "legalTeamId"));
    const name = teamName(formData);
    if (name === team.name) {
      return done("Název se nezměnil.");
    }
    try {
      await getPrisma().legalTeam.update({ where: { id: team.id }, data: { name } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return failed("Tým s tímto názvem už existuje.");
      }
      throw error;
    }
    await writeAuditLog({
      organizationId,
      entityType: "LegalTeam",
      entityId: team.id,
      action: "UPDATE",
      changedById: actor.id,
      oldValue: { name: team.name },
      newValue: { name },
    });
    revalidateTeams();
    return done(`Tým byl přejmenován na „${name}“.`);
  } catch (error) {
    return failed(errorMessage(error));
  }
}

// Archivace nemaže členství ani přiřazení — jen přestanou dávat přístup. Po
// obnovení platí znovu.
async function setTeamArchived(formData: FormData, archived: boolean) {
  const actor = await authorize();
  const organizationId = actor.organizationId;
  const team = await findTeam(organizationId, requiredString(formData, "legalTeamId"));
  if (Boolean(team.archivedAt) === archived) {
    return;
  }
  const archivedAt = archived ? new Date() : null;
  await getPrisma().legalTeam.update({
    where: { id: team.id },
    data: { archivedAt },
  });
  await writeAuditLog({
    organizationId,
    entityType: "LegalTeam",
    entityId: team.id,
    action: archived ? "ARCHIVE" : "RESTORE",
    changedById: actor.id,
    oldValue: { name: team.name, archivedAt: team.archivedAt },
    newValue: { name: team.name, archivedAt },
  });
  revalidateTeams();
}

export async function archiveLegalTeam(formData: FormData) {
  await setTeamArchived(formData, true);
}

export async function restoreLegalTeam(formData: FormData) {
  await setTeamArchived(formData, false);
}

// Přidání člena do týmu. Člověk může být v jednom týmu kanceláře
// (@@unique([organizationId, userId])) — přidáním do jiného týmu se přesune.
export async function assignLegalTeamMember(formData: FormData) {
  const actor = await authorize();
  const organizationId = actor.organizationId;
  const legalTeamId = requiredString(formData, "legalTeamId");
  const userId = requiredString(formData, "userId");
  const prisma = getPrisma();

  const [team, membership, previous] = await Promise.all([
    prisma.legalTeam.findFirst({
      where: { id: legalTeamId, organizationId, archivedAt: null },
      select: {
        id: true,
        name: true,
        _count: { select: { projectAssignments: true, caseAssignments: true } },
      },
    }),
    prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId,
        status: OrganizationMemberStatus.ACTIVE,
        user: { is: { active: true } },
      },
      select: { id: true },
    }),
    prisma.legalTeamMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { legalTeamId: true, legalTeam: { select: { name: true } } },
    }),
  ]);
  if (!team || !membership) {
    throw new Error("Tým nebo aktivní člen kanceláře nebyl nalezen.");
  }
  if (previous?.legalTeamId === team.id) {
    return;
  }

  const assigned = await prisma.legalTeamMember.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: { legalTeamId },
    create: { organizationId, legalTeamId, userId },
  });
  await writeAuditLog({
    organizationId,
    entityType: "LegalTeamMember",
    entityId: assigned.id,
    action: "ASSIGN",
    changedById: actor.id,
    oldValue: previous
      ? { legalTeamId: previous.legalTeamId, teamName: previous.legalTeam.name, userId }
      : null,
    newValue: { legalTeamId, teamName: team.name, userId },
  });

  try {
    await queueTeamJoinedNotification({
      recipientUserId: userId,
      actorUserId: actor.id,
      team: {
        id: team.id,
        name: team.name,
        projectCount: team._count.projectAssignments,
        caseCount: team._count.caseAssignments,
      },
    });
  } catch (error) {
    console.error("Notifikaci o přidání do týmu se nepodařilo zařadit.", error);
  }

  revalidateTeams();
}

export async function removeLegalTeamMember(formData: FormData) {
  const actor = await authorize();
  const organizationId = actor.organizationId;
  const membershipId = requiredString(formData, "membershipId");
  const prisma = getPrisma();
  const membership = await prisma.legalTeamMember.findFirst({
    where: { id: membershipId, organizationId },
    include: { legalTeam: { select: { name: true } } },
  });
  if (!membership) {
    throw new Error("Členství v týmu nebylo nalezeno.");
  }
  await prisma.legalTeamMember.delete({ where: { id: membership.id } });
  await writeAuditLog({
    organizationId,
    entityType: "LegalTeamMember",
    entityId: membership.id,
    action: "REMOVE",
    changedById: actor.id,
    oldValue: {
      legalTeamId: membership.legalTeamId,
      teamName: membership.legalTeam.name,
      userId: membership.userId,
    },
  });
  revalidateTeams();
}
