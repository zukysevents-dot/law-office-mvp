"use server";

import { revalidatePath } from "next/cache";

import { SubjectRole } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { enumValue, optionalString, requiredString } from "@/lib/form";
import {
  andWhere,
  assertCanEditRecord,
  subjectVisibilityWhere,
} from "@/lib/permissions";
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

  // The subject must be one the user can see — otherwise attaching it here would
  // leak the subject's data via the relation (IDOR / cross-tenant guard).
  const subject = await prisma.subject.findFirst({
    where: andWhere({ id: subjectId }, subjectVisibilityWhere(currentUser)),
    select: { id: true },
  });
  if (!subject) {
    throw new Error("Subjekt nenalezen nebo k němu nemáte oprávnění.");
  }

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
      organizationId: currentUser.organizationId,
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
  const subjectId = requiredString(formData, "subjectId");
  const role = enumValue(SubjectRole, formData.get("role"), SubjectRole.CLIENT);
  const legalCase = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { assignees: { select: { userId: true } } },
  });
  assertCanEditRecord(currentUser, "Case", legalCase);
  // projectId is authoritative on the already-authorized case. Never trust the
  // hidden form field here: a crafted POST could otherwise attach this subject
  // to an unrelated (including cross-tenant) project and expose it on that
  // project's detail page through SubjectRelation.
  const projectId = legalCase.projectId;

  // The subject must be one the user can see — otherwise attaching it here would
  // leak the subject's data via the relation (IDOR / cross-tenant guard).
  const subject = await prisma.subject.findFirst({
    where: andWhere({ id: subjectId }, subjectVisibilityWhere(currentUser)),
    select: { id: true },
  });
  if (!subject) {
    throw new Error("Subjekt nenalezen nebo k němu nemáte oprávnění.");
  }

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
      organizationId: currentUser.organizationId,
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
