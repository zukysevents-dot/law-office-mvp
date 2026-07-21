"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { FeeType, SubjectType } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  checkboxValue,
  enumValue,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/form";
import {
  assertCanArchiveRecords,
  assertCanEditRecord,
  assertSameOrg,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// The per-org unique IČO violation. Callers redirect back to the form with
// ?error=duplicate-ico (see rethrowUnlessDuplicateIco) so the user gets a
// readable Czech message instead of a full-page 500 error boundary.
function isDuplicateIcoError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

// Swallow the duplicate-IČO violation (caller handles it via a redirect),
// rethrow anything else unchanged.
function rethrowUnlessDuplicateIco(error: unknown): null {
  if (isDuplicateIcoError(error)) return null;
  throw error;
}

export async function createSubject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const type = enumValue(SubjectType, formData.get("type"), SubjectType.COMPANY);

  const subject = await prisma.subject.create({
    data: {
      organizationId: currentUser.organizationId,
      type,
      name: requiredString(formData, "name"),
      ico: optionalString(formData, "ico"),
      dic: optionalString(formData, "dic"),
      email: optionalString(formData, "email"),
      address: optionalString(formData, "address"),
      legalForm: optionalString(formData, "legalForm"),
      statutoryBody: optionalString(formData, "statutoryBody"),
      status: optionalString(formData, "status") ?? "ACTIVE",
      insolvencyStatus: optionalString(formData, "insolvencyStatus"),
      riskFlag: checkboxValue(formData, "riskFlag"),
      internalNote: optionalString(formData, "internalNote"),
      legalServicesContractUrl: optionalString(
        formData,
        "legalServicesContractUrl",
      ),
      sharepointUrl: optionalString(formData, "sharepointUrl"),
      feeType: enumValue(FeeType, formData.get("feeType"), FeeType.HOURLY),
      hourlyRate: optionalNumber(formData, "hourlyRate"),
      flatFee: optionalNumber(formData, "flatFee"),
      feeNote: optionalString(formData, "feeNote"),
    },
  }).catch(rethrowUnlessDuplicateIco);

  if (!subject) {
    redirect("/subjects?error=duplicate-ico#new-subject");
  }

  await prisma.auditLog.create({
    data: {
      entityType: "Subject",
      entityId: subject.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: {
        name: subject.name,
        ico: subject.ico,
        type: subject.type,
        riskFlag: subject.riskFlag,
      },
    },
  });

  revalidatePath("/subjects");
  redirect(`/subjects/${subject.id}`);
}

export async function updateSubject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const subjectId = requiredString(formData, "id");
  const type = enumValue(SubjectType, formData.get("type"), SubjectType.COMPANY);

  const oldSubject = await prisma.subject.findUniqueOrThrow({
    where: { id: subjectId },
  });
  assertCanEditRecord(currentUser, "Subject", oldSubject);

  const subject = await prisma.subject.update({
    where: { id: subjectId },
    data: {
      type,
      name: requiredString(formData, "name"),
      ico: optionalString(formData, "ico"),
      dic: optionalString(formData, "dic"),
      email: optionalString(formData, "email"),
      address: optionalString(formData, "address"),
      legalForm: optionalString(formData, "legalForm"),
      statutoryBody: optionalString(formData, "statutoryBody"),
      status: optionalString(formData, "status") ?? "ACTIVE",
      insolvencyStatus: optionalString(formData, "insolvencyStatus"),
      riskFlag: checkboxValue(formData, "riskFlag"),
      internalNote: optionalString(formData, "internalNote"),
      legalServicesContractUrl: optionalString(
        formData,
        "legalServicesContractUrl",
      ),
      sharepointUrl: optionalString(formData, "sharepointUrl"),
      feeType: enumValue(FeeType, formData.get("feeType"), FeeType.HOURLY),
      hourlyRate: optionalNumber(formData, "hourlyRate"),
      flatFee: optionalNumber(formData, "flatFee"),
      feeNote: optionalString(formData, "feeNote"),
    },
  }).catch(rethrowUnlessDuplicateIco);

  if (!subject) {
    redirect(`/subjects/${subjectId}/edit?error=duplicate-ico`);
  }

  await prisma.auditLog.create({
    data: {
      entityType: "Subject",
      entityId: subject.id,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: auditJson(oldSubject),
      newValue: auditJson(subject),
    },
  });

  revalidatePath("/subjects");
  revalidatePath(`/subjects/${subject.id}`);
  redirect(`/subjects/${subject.id}`);
}

export async function archiveSubject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanArchiveRecords(currentUser);
  const subjectId = requiredString(formData, "id");
  const oldSubject = await prisma.subject.findUniqueOrThrow({
    where: { id: subjectId },
  });
  assertSameOrg(currentUser, oldSubject);
  const subject = await prisma.subject.update({
    where: { id: subjectId },
    data: { archivedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Subject",
      entityId: subject.id,
      action: "ARCHIVE",
      changedById: currentUser.id,
      oldValue: auditJson(oldSubject),
      newValue: auditJson(subject),
    },
  });

  revalidatePath("/subjects");
  revalidatePath(`/subjects/${subject.id}`);
}

export async function restoreSubject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanArchiveRecords(currentUser);
  const subjectId = requiredString(formData, "id");
  const oldSubject = await prisma.subject.findUniqueOrThrow({
    where: { id: subjectId },
  });
  assertSameOrg(currentUser, oldSubject);
  const subject = await prisma.subject.update({
    where: { id: subjectId },
    data: { archivedAt: null },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Subject",
      entityId: subject.id,
      action: "RESTORE",
      changedById: currentUser.id,
      oldValue: auditJson(oldSubject),
      newValue: auditJson(subject),
    },
  });

  revalidatePath("/subjects");
  revalidatePath(`/subjects/${subject.id}`);
}
