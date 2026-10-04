"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { FeeType, SubjectType } from "@/generated/prisma/enums";
import { setArchived } from "@/lib/archive";
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
  assertCanEditRecord,
  assertCanManageSubjects,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { isSafeHttpUrl } from "@/lib/utils";

// The per-org unique IČO violation is an EXPECTED user mistake, not a crash:
// swallow it so the caller can redirect back to the form with an inline notice.
// Only IČO-scoped P2002s are absorbed — any other unique constraint (or
// non-P2002 error) rethrows unchanged.
function nullOnDuplicateIco(error: unknown): null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    // Under the pg driver adapter (Prisma 7) `meta` carries only modelName +
    // driverAdapterError — there is NO `meta.target`, so a column check alone
    // would never match. `@@unique([organizationId, ico])` is Subject's only
    // unique constraint besides the primary key, so any P2002 here IS the IČO
    // collision. meta.target is still honoured when a future driver provides it.
    const target = error.meta?.target;
    const mentionsIco =
      target === undefined ||
      (Array.isArray(target) ? target.includes("ico") : target === "ico");
    if (mentionsIco) {
      return null;
    }
  }
  throw error;
}

export async function createSubject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageSubjects(currentUser);
  const type = enumValue(SubjectType, formData.get("type"), SubjectType.COMPANY);

  // Defense-in-depth: never persist a non-http(s) URL (e.g. javascript:/data:)
  // so it can't later be rendered as a clickable link.
  const rawContractUrl = optionalString(formData, "legalServicesContractUrl");
  const legalServicesContractUrl = isSafeHttpUrl(rawContractUrl)
    ? rawContractUrl
    : null;

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
      legalServicesContractUrl,
      sharepointUrl: optionalString(formData, "sharepointUrl"),
      feeType: enumValue(FeeType, formData.get("feeType"), FeeType.HOURLY),
      hourlyRate: optionalNumber(formData, "hourlyRate"),
      flatFee: optionalNumber(formData, "flatFee"),
      feeNote: optionalString(formData, "feeNote"),
    },
  }).catch(nullOnDuplicateIco);

  if (!subject) {
    redirect("/subjects?error=ico#new-subject");
  }

  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
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

  // Defense-in-depth: never persist a non-http(s) URL (e.g. javascript:/data:)
  // so it can't later be rendered as a clickable link.
  const rawContractUrl = optionalString(formData, "legalServicesContractUrl");
  const legalServicesContractUrl = isSafeHttpUrl(rawContractUrl)
    ? rawContractUrl
    : null;

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
      legalServicesContractUrl,
      sharepointUrl: optionalString(formData, "sharepointUrl"),
      feeType: enumValue(FeeType, formData.get("feeType"), FeeType.HOURLY),
      hourlyRate: optionalNumber(formData, "hourlyRate"),
      flatFee: optionalNumber(formData, "flatFee"),
      feeNote: optionalString(formData, "feeNote"),
    },
  }).catch(nullOnDuplicateIco);

  if (!subject) {
    redirect(`/subjects/${subjectId}/edit?error=ico`);
  }

  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
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

async function setSubjectArchived(formData: FormData, archived: boolean) {
  const prisma = getPrisma();
  const subject = await setArchived(formData, "Subject", archived, {
    find: (id) => prisma.subject.findUniqueOrThrow({ where: { id } }),
    update: (id, data) => prisma.subject.update({ where: { id }, data }),
  });
  revalidatePath("/subjects");
  revalidatePath(`/subjects/${subject.id}`);
}

export async function archiveSubject(formData: FormData) {
  await setSubjectArchived(formData, true);
}

export async function restoreSubject(formData: FormData) {
  await setSubjectArchived(formData, false);
}
