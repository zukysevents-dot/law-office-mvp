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
import { isSafeHttpUrl } from "@/lib/utils";

// Sken dokladu = odkaz (http/https) do externího úložiště, ne soubor v DB.
// Vrací validovaná pole; prázdný/neplatný odkaz odmítne.
function parseScanFields(formData: FormData) {
  const scanUrl = optionalString(formData, "scanUrl");
  if (scanUrl) {
    if (!isSafeHttpUrl(scanUrl)) {
      throw new Error("Odkaz na sken musí být platná http(s) adresa.");
    }
    if (scanUrl.length > 2000) {
      throw new Error("Odkaz na sken je příliš dlouhý.");
    }
  }
  const scanFileName = scanUrl
    ? optionalString(formData, "scanFileName")
    : null;
  // Poznámka ke skenu má smysl jen se skenem (prázdná URL → null), s limitem.
  const scanNote = scanUrl ? optionalString(formData, "scanNote") : null;
  if (scanNote && scanNote.length > 2000) {
    throw new Error("Poznámka ke skenu je příliš dlouhá.");
  }
  return {
    scanUrl,
    scanFileName,
    scanNote,
    scanUploadedAt: scanUrl ? new Date() : null,
  };
}

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
  const { scanUrl, scanFileName, scanNote, scanUploadedAt } =
    parseScanFields(formData);

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
        scanUrl,
        scanFileName,
        scanNote,
        scanUploadedAt,
        createdById: currentUser.id,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Subject",
        entityId: subjectId,
        action: "AML_IDENTIFY",
        changedById: currentUser.id,
        // Metadata only — document number AND scan URL are NEVER logged.
        newValue: auditJson({
          identificationId: created.id,
          documentType,
          documentNumberMasked: created.documentNumberMasked,
          verifiedAt: verifiedAt.toISOString(),
          expiresAt: expiresAt?.toISOString() ?? null,
          issueCountry,
          hasScan: Boolean(scanUrl),
          scanFileName,
        }),
      },
    });
  });

  revalidatePath(`/subjects/${subjectId}`);
  revalidatePath("/aml");
}

// A-3b: doplnit / změnit odkaz na sken dokladu u existující identifikace (ř.26).
export async function updateIdentificationScan(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.AML);
  assertCanManageAml(currentUser);

  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  const identificationId = requiredString(formData, "identificationId");
  const { scanUrl, scanFileName, scanNote, scanUploadedAt } =
    parseScanFields(formData);

  // Org-scope: findFirst, nikdy findUnique({id}) — žádný cross-org únik.
  const existing = await prisma.amlIdentification.findFirst({
    where: { id: identificationId, organizationId },
    select: { id: true, subjectId: true },
  });
  if (!existing) {
    throw new Error("Identifikace nenalezena.");
  }

  await prisma.amlIdentification.update({
    where: { id: existing.id },
    data: { scanUrl, scanFileName, scanNote, scanUploadedAt },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Subject",
      entityId: existing.subjectId,
      action: "AML_SCAN_UPDATE",
      changedById: currentUser.id,
      // Metadata only — never the scan URL itself.
      newValue: auditJson({
        identificationId: existing.id,
        hasScan: Boolean(scanUrl),
        scanFileName,
      }),
    },
  });

  revalidatePath(`/subjects/${existing.subjectId}`);
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
