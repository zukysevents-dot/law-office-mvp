"use server";

import { revalidatePath } from "next/cache";

import { SubjectRole } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { enumValue, optionalString, requiredString } from "@/lib/form";
import { assertCanEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function addProjectSubjectRelation(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const projectId = requiredString(formData, "projectId");
  const subjectId = requiredString(formData, "subjectId");
  const role = enumValue(SubjectRole, formData.get("role"), SubjectRole.CLIENT);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { assignees: { select: { userId: true } } },
  });
  assertCanEditRecord(currentUser, "Project", project);

  await prisma.subjectRelation.create({
    data: {
      subjectId,
      projectId,
      relationType: "PROJECT",
      role,
      note: optionalString(formData, "note"),
      createdById: currentUser.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "SubjectRelation",
      entityId: projectId,
      action: "CREATE_PROJECT_RELATION",
      changedById: currentUser.id,
      newValue: {
        subjectId,
        projectId,
        relationType: "PROJECT",
        role,
      },
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/conflict-check");
}

export async function addCaseSubjectRelation(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const caseId = requiredString(formData, "caseId");
  const projectId = requiredString(formData, "projectId");
  const subjectId = requiredString(formData, "subjectId");
  const role = enumValue(SubjectRole, formData.get("role"), SubjectRole.CLIENT);
  const legalCase = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { assignees: { select: { userId: true } } },
  });
  assertCanEditRecord(currentUser, "Case", legalCase);

  await prisma.subjectRelation.create({
    data: {
      subjectId,
      caseId,
      projectId,
      relationType: "CASE",
      role,
      note: optionalString(formData, "note"),
      createdById: currentUser.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "SubjectRelation",
      entityId: caseId,
      action: "CREATE_CASE_RELATION",
      changedById: currentUser.id,
      newValue: {
        subjectId,
        caseId,
        projectId,
        relationType: "CASE",
        role,
      },
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/conflict-check");
}
