"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { OrganizationMemberStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { assertCanEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Přiřazovaný uživatel musí být aktivním členem stejné kanceláře jako ten, kdo
// přiřazuje (žádné cross-org přiřazení). User nemá přímé organizationId — řeší
// se přes členství.
async function assertSameOrgMember(
  organizationId: string | null | undefined,
  userId: string,
) {
  const prisma = getPrisma();
  const membership = organizationId
    ? await prisma.organizationMember.findFirst({
        where: {
          userId,
          organizationId,
          status: OrganizationMemberStatus.ACTIVE,
        },
        select: { id: true },
      })
    : null;
  if (!membership) {
    throw new Error("Uživatel nepatří do vaší kanceláře.");
  }
}

export async function addProjectAssignee(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const projectId = requiredString(formData, "projectId");
  const userId = requiredString(formData, "userId");

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      organizationId: true,
      responsibleUserId: true,
      assignees: { select: { userId: true } },
    },
  });
  // Přiřazovat smí ten, kdo smí projekt editovat (ADMIN/PARTNER/odpovědný nebo
  // řešitel LAWYER) — stejný gate jako editace, žádné nové oprávnění.
  assertCanEditRecord(currentUser, "Project", project);
  await assertSameOrgMember(currentUser.organizationId, userId);

  // Idempotentní díky @@unique([projectId, userId]); duplicitu tiše přeskoč.
  const existing = await prisma.projectAssignee.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  let assignee;
  try {
    assignee = await prisma.projectAssignee.create({
      data: {
        organizationId: project.organizationId,
        projectId,
        userId,
        assignedById: currentUser.id,
      },
    });
  } catch (error) {
    // Souběžné přidání téhož řešitele narazí na @@unique([projectId,userId]);
    // ber jako idempotentní no-op (řádek už mezitím vznikl).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }

  await writeAuditLog({
    entityType: "ProjectAssignee",
    entityId: assignee.id,
    action: "CREATE",
    changedById: currentUser.id,
    newValue: { projectId, userId },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

export async function removeProjectAssignee(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const id = requiredString(formData, "id");

  const assignee = await prisma.projectAssignee.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      projectId: true,
      userId: true,
      project: {
        select: {
          id: true,
          organizationId: true,
          responsibleUserId: true,
          assignees: { select: { userId: true } },
        },
      },
    },
  });
  assertCanEditRecord(currentUser, "Project", assignee.project);

  await prisma.projectAssignee.delete({ where: { id } });

  await writeAuditLog({
    entityType: "ProjectAssignee",
    entityId: id,
    action: "DELETE",
    changedById: currentUser.id,
    oldValue: { projectId: assignee.projectId, userId: assignee.userId },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${assignee.projectId}`);
}
