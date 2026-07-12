"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  optionalDate,
  optionalNumber,
  optionalString,
  requiredString,
  safeInternalRedirectPath,
} from "@/lib/form";
import { setArchived } from "@/lib/archive";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { resolveVisibleMatterSelection } from "@/lib/matter-integrity.server";
import {
  assertCanEditRecord,
  assertCanManageReferences,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function createReference(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageReferences(currentUser);
  const matter = await resolveVisibleMatterSelection(prisma, currentUser, {
    projectId: optionalString(formData, "projectId"),
    caseId: optionalString(formData, "caseId"),
    subjectId: optionalString(formData, "subjectId"),
  });
  const { projectId, caseId, subjectId } = matter;
  const returnTo = safeInternalRedirectPath(
    optionalString(formData, "returnTo"),
    "/references",
  );

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
      organizationId: currentUser.organizationId,
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

  const matter = await resolveVisibleMatterSelection(prisma, currentUser, {
    projectId: optionalString(formData, "projectId"),
    caseId: optionalString(formData, "caseId"),
    subjectId: optionalString(formData, "subjectId"),
  });
  const { projectId, caseId, subjectId } = matter;

  const reference = await prisma.reference.update({
    where: { id: referenceId },
    data: {
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
      action: "UPDATE",
      changedById: currentUser.id,
      organizationId: currentUser.organizationId,
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
