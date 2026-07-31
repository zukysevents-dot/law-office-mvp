"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { assertCanAdministerOrg } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

async function authorize(organizationId: string) {
  const currentUser = await getCurrentUser();
  assertCanAdministerOrg(currentUser, organizationId);
  return currentUser;
}

export async function createLegalTeam(formData: FormData) {
  const organizationId = requiredString(formData, "organizationId");
  const name = requiredString(formData, "name").trim().slice(0, 120);
  const actor = await authorize(organizationId);
  const prisma = getPrisma();
  const team = await prisma.legalTeam.create({
    data: { organizationId, name },
  });
  await prisma.auditLog.create({
    data: {
      organizationId,
      entityType: "LegalTeam",
      entityId: team.id,
      action: "CREATE",
      changedById: actor.id,
      newValue: { name },
    },
  });
  revalidatePath("/settings/organization");
  revalidatePath("/reports/by-team");
}

export async function assignLegalTeamMember(formData: FormData) {
  const organizationId = requiredString(formData, "organizationId");
  const legalTeamId = requiredString(formData, "legalTeamId");
  const userId = requiredString(formData, "userId");
  const actor = await authorize(organizationId);
  const prisma = getPrisma();

  const [team, membership] = await Promise.all([
    prisma.legalTeam.findFirst({
      where: { id: legalTeamId, organizationId, archivedAt: null },
      select: { id: true },
    }),
    prisma.organizationMember.findFirst({
      where: { organizationId, userId, status: "ACTIVE" },
      select: { id: true },
    }),
  ]);
  if (!team || !membership) {
    throw new Error("Tým nebo aktivní člen kanceláře nebyl nalezen.");
  }

  const assigned = await prisma.legalTeamMember.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: { legalTeamId },
    create: { organizationId, legalTeamId, userId },
  });
  await prisma.auditLog.create({
    data: {
      organizationId,
      entityType: "LegalTeamMember",
      entityId: assigned.id,
      action: "ASSIGN",
      changedById: actor.id,
      newValue: { legalTeamId, userId },
    },
  });
  revalidatePath("/settings/organization");
  revalidatePath("/reports/by-team");
}

export async function removeLegalTeamMember(formData: FormData) {
  const organizationId = requiredString(formData, "organizationId");
  const membershipId = requiredString(formData, "membershipId");
  const actor = await authorize(organizationId);
  const prisma = getPrisma();
  const membership = await prisma.legalTeamMember.findFirst({
    where: { id: membershipId, organizationId },
  });
  if (!membership) {
    throw new Error("Členství v týmu nebylo nalezeno.");
  }
  await prisma.legalTeamMember.delete({ where: { id: membership.id } });
  await prisma.auditLog.create({
    data: {
      organizationId,
      entityType: "LegalTeamMember",
      entityId: membership.id,
      action: "REMOVE",
      changedById: actor.id,
      oldValue: { legalTeamId: membership.legalTeamId, userId: membership.userId },
    },
  });
  revalidatePath("/settings/organization");
  revalidatePath("/reports/by-team");
}
