"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { OrganizationMemberStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { assertCanEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Přiřazovaný uživatel musí být aktivním členem stejné kanceláře (viz
// project-assignees). User nemá přímé organizationId — řeší se přes členství.
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

export async function addCaseAssignee(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const caseId = requiredString(formData, "caseId");
  const userId = requiredString(formData, "userId");

  const legalCase = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    select: {
      id: true,
      projectId: true,
      organizationId: true,
      responsibleUserId: true,
      assignees: { select: { userId: true } },
    },
  });
  assertCanEditRecord(currentUser, "Case", legalCase);
  await assertSameOrgMember(currentUser.organizationId, userId);

  const existing = await prisma.caseAssignee.findUnique({
    where: { caseId_userId: { caseId, userId } },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  let assignee;
  try {
    assignee = await prisma.caseAssignee.create({
      data: {
        organizationId: legalCase.organizationId,
        caseId,
        userId,
        assignedById: currentUser.id,
      },
    });
  } catch (error) {
    // Souběžné přidání téhož řešitele narazí na @@unique([caseId,userId]);
    // ber jako idempotentní no-op.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }

  await writeAuditLog({
    entityType: "CaseAssignee",
    entityId: assignee.id,
    action: "CREATE",
    changedById: currentUser.id,
    newValue: { caseId, userId },
  });

  revalidatePath("/cases");
  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/projects/${legalCase.projectId}`);
}

export async function removeCaseAssignee(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const id = requiredString(formData, "id");

  const assignee = await prisma.caseAssignee.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      caseId: true,
      userId: true,
      case: {
        select: {
          id: true,
          projectId: true,
          organizationId: true,
          responsibleUserId: true,
          assignees: { select: { userId: true } },
        },
      },
    },
  });
  assertCanEditRecord(currentUser, "Case", assignee.case);

  await prisma.caseAssignee.delete({ where: { id } });

  await writeAuditLog({
    entityType: "CaseAssignee",
    entityId: id,
    action: "DELETE",
    changedById: currentUser.id,
    oldValue: { caseId: assignee.caseId, userId: assignee.userId },
  });

  revalidatePath("/cases");
  revalidatePath(`/cases/${assignee.caseId}`);
  revalidatePath(`/projects/${assignee.case.projectId}`);
}
