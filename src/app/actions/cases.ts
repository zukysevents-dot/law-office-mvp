"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CaseStatus, SubjectRole } from "@/generated/prisma/enums";
import { setArchived } from "@/lib/archive";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  enumValue,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/form";
import {
  andWhere,
  assertCanEditRecord,
  projectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function createCase(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const status = enumValue(CaseStatus, formData.get("status"), CaseStatus.ACTIVE);
  const projectId = requiredString(formData, "projectId");

  const legalCase = await prisma.$transaction(async (tx) => {
    // Scope by visibility so a case can't be grafted onto a project the user
    // can't see (the ethics wall must hold on writes, not just reads).
    const project = await tx.project.findFirst({
      where: andWhere({ id: projectId }, projectVisibilityWhere(currentUser)),
      select: { mainSubjectId: true },
    });
    if (!project) {
      throw new Error("Projekt nenalezen nebo k němu nemáte oprávnění.");
    }
    const created = await tx.case.create({
      data: {
        organizationId: currentUser.organizationId,
        projectId,
        name: requiredString(formData, "name"),
        fileNumber: optionalString(formData, "fileNumber"),
        responsibleUserId: optionalString(formData, "responsibleUserId"),
        status,
        hourlyRate: optionalNumber(formData, "hourlyRate"),
        sharepointUrl: optionalString(formData, "sharepointUrl"),
        note: optionalString(formData, "note"),
      },
    });

    await tx.subjectRelation.create({
      data: {
        subjectId: project.mainSubjectId,
        relationType: "CASE",
        role: SubjectRole.CLIENT,
        caseId: created.id,
        projectId,
        createdById: currentUser.id,
        note: "Subjekt převzatý z projektu",
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Case",
        entityId: created.id,
        action: "CREATE",
        changedById: currentUser.id,
        newValue: {
          name: created.name,
          projectId: created.projectId,
          fileNumber: created.fileNumber,
        },
      },
    });

    return created;
  });

  revalidatePath("/cases");
  redirect(`/cases/${legalCase.id}`);
}

export async function updateCase(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const caseId = requiredString(formData, "id");
  const status = enumValue(CaseStatus, formData.get("status"), CaseStatus.ACTIVE);

  const oldCase = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { assignees: { select: { userId: true } } },
  });
  assertCanEditRecord(currentUser, "Case", oldCase);

  const legalCase = await prisma.case.update({
    where: { id: caseId },
    data: {
      projectId: requiredString(formData, "projectId"),
      name: requiredString(formData, "name"),
      fileNumber: optionalString(formData, "fileNumber"),
      responsibleUserId: optionalString(formData, "responsibleUserId"),
      status,
      hourlyRate: optionalNumber(formData, "hourlyRate"),
      sharepointUrl: optionalString(formData, "sharepointUrl"),
      note: optionalString(formData, "note"),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Case",
      entityId: legalCase.id,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: auditJson(oldCase),
      newValue: auditJson(legalCase),
    },
  });

  revalidatePath("/cases");
  revalidatePath(`/cases/${legalCase.id}`);
  revalidatePath(`/projects/${legalCase.projectId}`);
  redirect(`/cases/${legalCase.id}`);
}

async function setCaseArchived(formData: FormData, archived: boolean) {
  const prisma = getPrisma();
  const legalCase = await setArchived(formData, "Case", archived, {
    find: (id) => prisma.case.findUniqueOrThrow({ where: { id } }),
    update: (id, data) => prisma.case.update({ where: { id }, data }),
  });
  revalidatePath("/cases");
  revalidatePath(`/cases/${legalCase.id}`);
  revalidatePath(`/projects/${legalCase.projectId}`);
}

export async function archiveCase(formData: FormData) {
  await setCaseArchived(formData, true);
}

export async function restoreCase(formData: FormData) {
  await setCaseArchived(formData, false);
}
