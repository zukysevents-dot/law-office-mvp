"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CaseStatus, SubjectRole } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { assertCanArchiveRecords } from "@/lib/archive-permissions";
import { getCurrentUser } from "@/lib/auth";
import { enumValue, optionalString, requiredString } from "@/lib/form";
import { assertCanEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function createCase(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const status = enumValue(CaseStatus, formData.get("status"), CaseStatus.ACTIVE);
  const projectId = requiredString(formData, "projectId");

  const legalCase = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { mainSubjectId: true },
    });
    const created = await tx.case.create({
      data: {
        projectId,
        name: requiredString(formData, "name"),
        fileNumber: optionalString(formData, "fileNumber"),
        responsibleUserId: optionalString(formData, "responsibleUserId"),
        status,
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

export async function archiveCase(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanArchiveRecords(currentUser);
  const caseId = requiredString(formData, "id");
  const oldCase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
  const legalCase = await prisma.case.update({
    where: { id: caseId },
    data: { archivedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Case",
      entityId: legalCase.id,
      action: "ARCHIVE",
      changedById: currentUser.id,
      oldValue: auditJson(oldCase),
      newValue: auditJson(legalCase),
    },
  });

  revalidatePath("/cases");
  revalidatePath(`/cases/${legalCase.id}`);
  revalidatePath(`/projects/${legalCase.projectId}`);
}

export async function restoreCase(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanArchiveRecords(currentUser);
  const caseId = requiredString(formData, "id");
  const oldCase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
  const legalCase = await prisma.case.update({
    where: { id: caseId },
    data: { archivedAt: null },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Case",
      entityId: legalCase.id,
      action: "RESTORE",
      changedById: currentUser.id,
      oldValue: auditJson(oldCase),
      newValue: auditJson(legalCase),
    },
  });

  revalidatePath("/cases");
  revalidatePath(`/cases/${legalCase.id}`);
  revalidatePath(`/projects/${legalCase.projectId}`);
}
