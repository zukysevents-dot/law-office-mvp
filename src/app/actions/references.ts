"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  optionalDate,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/form";
import { setArchived } from "@/lib/archive";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  andWhere,
  assertCanEditRecord,
  caseVisibilityWhere,
  projectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function createReference(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const projectId = optionalString(formData, "projectId");
  const caseId = optionalString(formData, "caseId");
  const subjectId = optionalString(formData, "subjectId");
  const returnTo = optionalString(formData, "returnTo") ?? "/references";

  // Scope to a matter the user can see; subjectId is the shared registry.
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: andWhere({ id: projectId }, projectVisibilityWhere(currentUser)),
      select: { id: true },
    });
    if (!project) {
      throw new Error("Projekt nenalezen nebo k němu nemáte oprávnění.");
    }
  }
  if (caseId) {
    const legalCase = await prisma.case.findFirst({
      where: andWhere({ id: caseId }, caseVisibilityWhere(currentUser)),
      select: { id: true },
    });
    if (!legalCase) {
      throw new Error("Případ nenalezen nebo k němu nemáte oprávnění.");
    }
  }

  const reference = await prisma.reference.create({
    data: {
      organizationId: currentUser.organizationId,
      title: requiredString(formData, "title"),
      projectId,
      caseId,
      subjectId,
      legalArea: optionalString(formData, "legalArea"),
      valueCzk: optionalNumber(formData, "valueCzk"),
      startDate: optionalDate(formData, "startDate"),
      endDate: optionalDate(formData, "endDate"),
      description: optionalString(formData, "description"),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Reference",
      entityId: reference.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: {
        title: reference.title,
        projectId,
        caseId,
        subjectId,
        legalArea: reference.legalArea,
      },
    },
  });

  revalidatePath("/references");

  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }

  if (caseId) {
    revalidatePath(`/cases/${caseId}`);
  }

  if (subjectId) {
    revalidatePath(`/subjects/${subjectId}`);
  }

  redirect(returnTo);
}

export async function updateReference(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const referenceId = requiredString(formData, "id");

  const oldReference = await prisma.reference.findUniqueOrThrow({
    where: { id: referenceId },
  });
  assertCanEditRecord(currentUser, "Reference", oldReference);

  const reference = await prisma.reference.update({
    where: { id: referenceId },
    data: {
      title: requiredString(formData, "title"),
      projectId: optionalString(formData, "projectId"),
      caseId: optionalString(formData, "caseId"),
      subjectId: optionalString(formData, "subjectId"),
      legalArea: optionalString(formData, "legalArea"),
      valueCzk: optionalNumber(formData, "valueCzk"),
      startDate: optionalDate(formData, "startDate"),
      endDate: optionalDate(formData, "endDate"),
      description: optionalString(formData, "description"),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Reference",
      entityId: reference.id,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: auditJson(oldReference),
      newValue: auditJson(reference),
    },
  });

  revalidatePath("/references");

  if (reference.projectId) {
    revalidatePath(`/projects/${reference.projectId}`);
  }

  if (reference.caseId) {
    revalidatePath(`/cases/${reference.caseId}`);
  }

  if (reference.subjectId) {
    revalidatePath(`/subjects/${reference.subjectId}`);
  }

  redirect("/references");
}

async function setReferenceArchived(formData: FormData, archived: boolean) {
  const prisma = getPrisma();
  const reference = await setArchived(formData, "Reference", archived, {
    find: (id) => prisma.reference.findUniqueOrThrow({ where: { id } }),
    update: (id, data) => prisma.reference.update({ where: { id }, data }),
  });
  revalidatePath("/references");
  revalidatePath(`/references/${reference.id}/edit`);
}

export async function archiveReference(formData: FormData) {
  await setReferenceArchived(formData, true);
}

export async function restoreReference(formData: FormData) {
  await setReferenceArchived(formData, false);
}
