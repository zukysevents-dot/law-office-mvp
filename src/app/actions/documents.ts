"use server";

import { revalidatePath } from "next/cache";

import { DocumentKind, ModuleKey } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  checkboxValue,
  enumValue,
  optionalString,
  requiredString,
} from "@/lib/form";
import {
  andWhere,
  assertCanArchiveRecords,
  assertCanManageDocumentTemplates,
  assertCanManageDocuments,
  caseVisibilityWhere,
  documentTemplateVisibilityWhere,
  documentVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { isSafeHttpUrl } from "@/lib/utils";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

const MAX_NAME = 300;
const MAX_TEXT = 4000;
const MAX_BODY = 50000;

// Module gate + resolve org. Role gate is applied per-action (documents vs
// templates differ), so this only does the entitlement check + org resolution.
async function authorize(): Promise<{
  currentUser: CurrentUser;
  organizationId: string;
}> {
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);
  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  return { currentUser, organizationId };
}

async function loadVisibleCase(currentUser: CurrentUser, caseId: string) {
  return getPrisma().case.findFirst({
    where: andWhere({ id: caseId }, caseVisibilityWhere(currentUser)),
    select: { id: true },
  });
}

async function loadVisibleSubject(currentUser: CurrentUser, subjectId: string) {
  return getPrisma().subject.findFirst({
    where: andWhere({ id: subjectId }, subjectVisibilityWhere(currentUser)),
    select: { id: true },
  });
}

function clampText(value: string | null, max: number): string | null {
  if (value && value.length > max) {
    throw new Error("Text je příliš dlouhý.");
  }
  return value;
}

// storageUrl is a link into the firm's SharePoint — only http(s) is allowed so a
// javascript:/data: URL can never be stored and later rendered as a link.
function requiredSafeUrl(formData: FormData, key: string): string {
  const value = requiredString(formData, key);
  if (!isSafeHttpUrl(value)) {
    throw new Error("Odkaz musí být platná http(s) adresa.");
  }
  return value;
}

// Exactly one of caseId/subjectId must be set (mirrors the DB CHECK). Both are
// validated against the caller's visibility so a document can't be hung on a
// case/subject from another org.
async function resolveAnchor(
  currentUser: CurrentUser,
  formData: FormData,
): Promise<{ caseId: string | null; subjectId: string | null }> {
  const caseId = optionalString(formData, "caseId");
  const subjectId = optionalString(formData, "subjectId");

  if ((caseId && subjectId) || (!caseId && !subjectId)) {
    throw new Error("Dokument musí být připnut buď ke spisu, nebo k subjektu.");
  }

  if (caseId) {
    const legalCase = await loadVisibleCase(currentUser, caseId);
    if (!legalCase) {
      throw new Error("Případ nenalezen.");
    }
    return { caseId, subjectId: null };
  }

  const subject = await loadVisibleSubject(currentUser, subjectId!);
  if (!subject) {
    throw new Error("Subjekt nenalezen.");
  }
  return { caseId: null, subjectId };
}

function revalidateDocument(anchor: {
  caseId?: string | null;
  subjectId?: string | null;
  documentId?: string | null;
}) {
  revalidatePath("/documents");
  if (anchor.caseId) {
    revalidatePath(`/cases/${anchor.caseId}`);
  }
  if (anchor.subjectId) {
    revalidatePath(`/subjects/${anchor.subjectId}`);
  }
  if (anchor.documentId) {
    revalidatePath(`/documents/${anchor.documentId}`);
  }
}

// --- Documents (DOC-3) -------------------------------------------------------

// Create a document (SharePoint reference) + its version 1, atomically. The
// currentVersion pointer is set in the same transaction so it never dangles.
export async function createDocument(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageDocuments(currentUser);

  const { caseId, subjectId } = await resolveAnchor(currentUser, formData);
  const name = clampText(requiredString(formData, "name"), MAX_NAME)!;
  const kind = enumValue(DocumentKind, formData.get("kind"), DocumentKind.OTHER);
  const description = clampText(optionalString(formData, "description"), MAX_TEXT);
  const mimeType = clampText(optionalString(formData, "mimeType"), MAX_NAME);
  const storageUrl = requiredSafeUrl(formData, "storageUrl");
  const note = clampText(optionalString(formData, "note"), MAX_TEXT);
  const sourceTemplateId = optionalString(formData, "sourceTemplateId");

  // If a sourceTemplate is named, it must belong to this org (visibility).
  if (sourceTemplateId) {
    const template = await prisma.documentTemplate.findFirst({
      where: andWhere(
        { id: sourceTemplateId },
        documentTemplateVisibilityWhere(currentUser),
      ),
      select: { id: true },
    });
    if (!template) {
      throw new Error("Šablona nenalezena.");
    }
  }

  const documentId = await prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        organizationId,
        caseId,
        subjectId,
        kind,
        name,
        description,
        mimeType,
        sourceTemplateId,
        createdById: currentUser.id,
      },
    });

    const version = await tx.documentVersion.create({
      data: {
        organizationId,
        documentId: document.id,
        version: 1,
        storageUrl,
        note,
        uploadedById: currentUser.id,
      },
    });

    await tx.document.update({
      where: { id: document.id },
      data: { currentVersionId: version.id, storageUrl },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Document",
        entityId: document.id,
        action: "CREATE",
        changedById: currentUser.id,
        newValue: auditJson({
          caseId,
          subjectId,
          kind,
          name,
          version: 1,
          sourceTemplateId,
        }),
      },
    });

    return document.id;
  });

  revalidateDocument({ caseId, subjectId, documentId });
}

// Add a new version (gap-free per document) and switch the current pointer.
export async function addDocumentVersion(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageDocuments(currentUser);

  const documentId = requiredString(formData, "documentId");
  const existing = await prisma.document.findFirst({
    where: andWhere({ id: documentId }, documentVisibilityWhere(currentUser)),
    select: { id: true, caseId: true, subjectId: true, archivedAt: true },
  });
  if (!existing) {
    throw new Error("Dokument nenalezen.");
  }
  if (existing.archivedAt) {
    throw new Error("Dokument je archivovaný.");
  }

  const storageUrl = requiredSafeUrl(formData, "storageUrl");
  const note = clampText(optionalString(formData, "note"), MAX_TEXT);

  await prisma.$transaction(async (tx) => {
    // Serialize concurrent version adds on this document (gap-free numbering):
    // lock the parent row so two requests can't both read the same _max and
    // collide on the (documentId, version) unique. Mirrors the FOR UPDATE
    // sequence lock used for invoice numbering (invoices.ts).
    await tx.$queryRaw`SELECT id FROM "documents" WHERE id = ${documentId} FOR UPDATE`;

    const last = await tx.documentVersion.aggregate({
      where: { documentId },
      _max: { version: true },
    });
    const nextVersion = (last._max.version ?? 0) + 1;

    const version = await tx.documentVersion.create({
      data: {
        organizationId,
        documentId,
        version: nextVersion,
        storageUrl,
        note,
        uploadedById: currentUser.id,
      },
    });

    await tx.document.update({
      where: { id: documentId },
      data: { currentVersionId: version.id, storageUrl },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Document",
        entityId: documentId,
        action: "ADD_VERSION",
        changedById: currentUser.id,
        newValue: auditJson({ version: nextVersion }),
      },
    });
  });

  revalidateDocument({
    caseId: existing.caseId,
    subjectId: existing.subjectId,
    documentId,
  });
}

// Edit metadata (name/description/kind). Does NOT touch versions/storageUrl.
export async function updateDocument(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser } = await authorize();
  assertCanManageDocuments(currentUser);

  const documentId = requiredString(formData, "documentId");
  const existing = await prisma.document.findFirst({
    where: andWhere({ id: documentId }, documentVisibilityWhere(currentUser)),
    select: {
      id: true,
      caseId: true,
      subjectId: true,
      name: true,
      kind: true,
      archivedAt: true,
    },
  });
  if (!existing) {
    throw new Error("Dokument nenalezen.");
  }
  if (existing.archivedAt) {
    throw new Error("Dokument je archivovaný.");
  }

  const name = clampText(requiredString(formData, "name"), MAX_NAME)!;
  const kind = enumValue(DocumentKind, formData.get("kind"), existing.kind);
  const description = clampText(optionalString(formData, "description"), MAX_TEXT);

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: documentId },
      data: { name, kind, description },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Document",
        entityId: documentId,
        action: "UPDATE",
        changedById: currentUser.id,
        oldValue: auditJson({ name: existing.name, kind: existing.kind }),
        newValue: auditJson({ name, kind }),
      },
    });
  });

  revalidateDocument({
    caseId: existing.caseId,
    subjectId: existing.subjectId,
    documentId,
  });
}

async function setDocumentArchived(formData: FormData, archived: boolean) {
  const prisma = getPrisma();
  const { currentUser } = await authorize();
  assertCanArchiveRecords(currentUser);

  const documentId = requiredString(formData, "documentId");
  const existing = await prisma.document.findFirst({
    where: andWhere({ id: documentId }, documentVisibilityWhere(currentUser)),
    select: { id: true, caseId: true, subjectId: true, archivedAt: true },
  });
  if (!existing) {
    throw new Error("Dokument nenalezen.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: documentId },
      data: { archivedAt: archived ? new Date() : null },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Document",
        entityId: documentId,
        action: archived ? "ARCHIVE" : "RESTORE",
        changedById: currentUser.id,
      },
    });
  });

  revalidateDocument({
    caseId: existing.caseId,
    subjectId: existing.subjectId,
    documentId,
  });
}

export async function archiveDocument(formData: FormData) {
  await setDocumentArchived(formData, true);
}

export async function restoreDocument(formData: FormData) {
  await setDocumentArchived(formData, false);
}

// --- Templates (DOC-4) -------------------------------------------------------

export async function createDocumentTemplate(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageDocumentTemplates(currentUser);

  const name = clampText(requiredString(formData, "name"), MAX_NAME)!;
  const kind = enumValue(DocumentKind, formData.get("kind"), DocumentKind.OTHER);
  const description = clampText(optionalString(formData, "description"), MAX_TEXT);
  const bodyTemplate = clampText(requiredString(formData, "bodyTemplate"), MAX_BODY)!;

  const template = await prisma.documentTemplate.create({
    data: {
      organizationId,
      name,
      kind,
      description,
      bodyTemplate,
      createdById: currentUser.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "DocumentTemplate",
      entityId: template.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: auditJson({ name, kind }),
    },
  });

  revalidatePath("/documents/templates");
}

export async function updateDocumentTemplate(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser } = await authorize();
  assertCanManageDocumentTemplates(currentUser);

  const templateId = requiredString(formData, "templateId");
  const existing = await prisma.documentTemplate.findFirst({
    where: andWhere(
      { id: templateId },
      documentTemplateVisibilityWhere(currentUser),
    ),
    select: { id: true, name: true },
  });
  if (!existing) {
    throw new Error("Šablona nenalezena.");
  }

  const name = clampText(requiredString(formData, "name"), MAX_NAME)!;
  const kind = enumValue(DocumentKind, formData.get("kind"), DocumentKind.OTHER);
  const description = clampText(optionalString(formData, "description"), MAX_TEXT);
  const bodyTemplate = clampText(requiredString(formData, "bodyTemplate"), MAX_BODY)!;
  const active = checkboxValue(formData, "active");

  await prisma.$transaction(async (tx) => {
    await tx.documentTemplate.update({
      where: { id: templateId },
      data: { name, kind, description, bodyTemplate, active },
    });

    await tx.auditLog.create({
      data: {
        entityType: "DocumentTemplate",
        entityId: templateId,
        action: "UPDATE",
        changedById: currentUser.id,
        oldValue: auditJson({ name: existing.name }),
        newValue: auditJson({ name, kind, active }),
      },
    });
  });

  revalidatePath("/documents/templates");
}

export async function archiveDocumentTemplate(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser } = await authorize();
  assertCanManageDocumentTemplates(currentUser);

  const templateId = requiredString(formData, "templateId");
  const existing = await prisma.documentTemplate.findFirst({
    where: andWhere(
      { id: templateId },
      documentTemplateVisibilityWhere(currentUser),
    ),
    select: { id: true, archivedAt: true },
  });
  if (!existing) {
    throw new Error("Šablona nenalezena.");
  }

  if (existing.archivedAt) {
    revalidatePath("/documents/templates");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.documentTemplate.update({
      where: { id: templateId },
      data: { archivedAt: new Date(), active: false },
    });

    await tx.auditLog.create({
      data: {
        entityType: "DocumentTemplate",
        entityId: templateId,
        action: "ARCHIVE",
        changedById: currentUser.id,
      },
    });
  });

  revalidatePath("/documents/templates");
}
