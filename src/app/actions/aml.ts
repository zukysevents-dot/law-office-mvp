"use server";

import { revalidatePath } from "next/cache";

import { AmlRiskLevel, ModuleKey } from "@/generated/prisma/enums";
import { deriveRiskFlag, maskDocumentNumber } from "@/lib/aml";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  checkboxValue,
  enumValue,
  optionalDate,
  optionalString,
  requiredString,
} from "@/lib/form";
import { assertCanManageAml } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

async function loadOrgSubject(
  organizationId: string,
  subjectId: string,
): Promise<{ id: string } | null> {
  return getPrisma().subject.findFirst({
    where: { id: subjectId, organizationId },
    select: { id: true },
  });
}

// A-3: record a client identification. The document number is encrypted at rest;
// only a masked hint is stored for display. Audit never carries the number.
export async function recordIdentification(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.AML);
  assertCanManageAml(currentUser);

  if (!isEncryptionConfigured()) {
    throw new Error(
      "Šifrovací klíč (DATA_ENCRYPTION_KEY) není nastaven — číslo dokladu nelze bezpečně uložit.",
    );
  }

  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  const subjectId = requiredString(formData, "subjectId");
  const documentType = requiredString(formData, "documentType");
  const documentNumber = requiredString(formData, "documentNumber");
  if (documentNumber.length > 64) {
    throw new Error("Číslo dokladu je příliš dlouhé.");
  }
  const issueCountry = optionalString(formData, "issueCountry");
  const issuedAt = optionalDate(formData, "issuedAt");
  const expiresAt = optionalDate(formData, "expiresAt");
  if (issuedAt && expiresAt && expiresAt <= issuedAt) {
    throw new Error("Platnost dokladu musí být po datu vydání.");
  }
  const verifiedAt = optionalDate(formData, "verifiedAt") ?? new Date();
  const method = optionalString(formData, "method");
  const note = optionalString(formData, "note");

  const subject = await loadOrgSubject(organizationId, subjectId);
  if (!subject) {
    throw new Error("Klient nenalezen.");
  }

  await prisma.$transaction(async (tx) => {
    const created = await tx.amlIdentification.create({
      data: {
        organizationId,
        subjectId,
        documentType,
        documentNumberEncrypted: encryptSecret(documentNumber),
        documentNumberMasked: maskDocumentNumber(documentNumber),
        issueCountry,
        issuedAt,
        expiresAt,
        verifiedAt,
        method,
        note,
        createdById: currentUser.id,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Subject",
        entityId: subjectId,
        action: "AML_IDENTIFY",
        changedById: currentUser.id,
        // Metadata only — the document number is NEVER logged.
        newValue: auditJson({
          identificationId: created.id,
          documentType,
          documentNumberMasked: created.documentNumberMasked,
          verifiedAt: verifiedAt.toISOString(),
          expiresAt: expiresAt?.toISOString() ?? null,
          issueCountry,
        }),
      },
    });
  });

  revalidatePath(`/subjects/${subjectId}`);
  revalidatePath("/aml");
}

// A-4: assess a subject's AML risk (one current assessment per subject) and
// propagate the result to Subject.riskFlag — all atomic.
export async function assessRisk(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.AML);
  assertCanManageAml(currentUser);

  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  const subjectId = requiredString(formData, "subjectId");
  const riskLevel = enumValue(
    AmlRiskLevel,
    formData.get("riskLevel"),
    AmlRiskLevel.MEDIUM,
  );
  const isPep = checkboxValue(formData, "isPep");
  const hasSanctions = checkboxValue(formData, "hasSanctions");
  const screeningResult = optionalString(formData, "screeningResult");
  const note = optionalString(formData, "note");

  const now = new Date();
  // Default next review in 12 months when not specified.
  const defaultReview = new Date(now);
  defaultReview.setUTCFullYear(now.getUTCFullYear() + 1);
  const reviewDueAt = optionalDate(formData, "reviewDueAt") ?? defaultReview;

  const subject = await loadOrgSubject(organizationId, subjectId);
  if (!subject) {
    throw new Error("Klient nenalezen.");
  }

  const riskFlag = deriveRiskFlag(riskLevel, isPep, hasSanctions);

  await prisma.$transaction(async (tx) => {
    const previous = await tx.amlAssessment.findUnique({
      where: { subjectId },
    });

    const assessment = await tx.amlAssessment.upsert({
      where: { subjectId },
      update: {
        riskLevel,
        isPep,
        hasSanctions,
        screeningResult,
        note,
        reviewDueAt,
        reviewedById: currentUser.id,
        reviewedAt: now,
      },
      create: {
        organizationId,
        subjectId,
        riskLevel,
        isPep,
        hasSanctions,
        screeningResult,
        note,
        reviewDueAt,
        reviewedById: currentUser.id,
        reviewedAt: now,
        createdById: currentUser.id,
      },
    });

    await tx.subject.update({
      where: { id: subjectId },
      data: { riskFlag },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Subject",
        entityId: subjectId,
        action: "AML_ASSESS",
        changedById: currentUser.id,
        oldValue: auditJson({
          riskLevel: previous?.riskLevel ?? null,
          isPep: previous?.isPep ?? null,
          hasSanctions: previous?.hasSanctions ?? null,
        }),
        newValue: auditJson({
          riskLevel: assessment.riskLevel,
          isPep,
          hasSanctions,
          riskFlag,
        }),
      },
    });
  });

  revalidatePath(`/subjects/${subjectId}`);
  revalidatePath("/aml");
}
