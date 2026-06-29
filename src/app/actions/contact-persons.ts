"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { optionalString, requiredString } from "@/lib/form";
import { assertCanEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function createContactPerson(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const subjectId = requiredString(formData, "subjectId");

  const subject = await prisma.subject.findUniqueOrThrow({
    where: { id: subjectId },
  });
  // Same gate as editing the subject (admin/partner) — keeps client master data
  // changes consistent and org-isolated.
  assertCanEditRecord(currentUser, "Subject", subject);

  const projectId = optionalString(formData, "projectId");
  const caseId = optionalString(formData, "caseId");

  // A matter-bound contact must belong to one of THIS client's matters.
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: currentUser.organizationId,
        mainSubjectId: subjectId,
      },
      select: { id: true },
    });
    if (!project) {
      throw new Error("Projekt nepatří tomuto klientovi.");
    }
  }
  if (caseId) {
    const legalCase = await prisma.case.findFirst({
      where: {
        id: caseId,
        organizationId: currentUser.organizationId,
        project: { mainSubjectId: subjectId },
      },
      select: { id: true },
    });
    if (!legalCase) {
      throw new Error("Případ nepatří tomuto klientovi.");
    }
  }

  const contact = await prisma.contactPerson.create({
    data: {
      organizationId: currentUser.organizationId,
      subjectId,
      firstName: requiredString(formData, "firstName"),
      lastName: requiredString(formData, "lastName"),
      email: optionalString(formData, "email"),
      phone: optionalString(formData, "phone"),
      role: optionalString(formData, "role"),
      projectId,
      caseId,
      note: optionalString(formData, "note"),
      createdById: currentUser.id,
    },
  });

  await writeAuditLog({
    entityType: "ContactPerson",
    entityId: contact.id,
    action: "CREATE",
    changedById: currentUser.id,
    newValue: {
      subjectId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      role: contact.role,
    },
  });

  revalidatePath(`/subjects/${subjectId}`);
}

export async function removeContactPerson(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const id = requiredString(formData, "id");

  const contact = await prisma.contactPerson.findUniqueOrThrow({
    where: { id },
    include: { subject: true },
  });
  assertCanEditRecord(currentUser, "Subject", contact.subject);

  await prisma.contactPerson.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  await writeAuditLog({
    entityType: "ContactPerson",
    entityId: id,
    action: "ARCHIVE",
    changedById: currentUser.id,
  });

  revalidatePath(`/subjects/${contact.subjectId}`);
}
