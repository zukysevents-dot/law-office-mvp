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
import {
  isSharepointUploadConfigured,
  uploadSharepointFile,
} from "@/lib/microsoft/graph-drive";
import {
  sharepointFolderSegments,
  uniqueSharepointFilename,
} from "@/lib/microsoft/sharepoint";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

const MAX_NAME = 300;
const MAX_TEXT = 4000;
const MAX_BODY = 50000;
const MAX_SHAREPOINT_FILE_BYTES = 4 * 1024 * 1024;

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
    select: {
      id: true,
      name: true,
      fileNumber: true,
      project: { select: { id: true, name: true } },
    },
  });
}

async function loadVisibleSubject(currentUser: CurrentUser, subjectId: string) {
  return getPrisma().subject.findFirst({
    where: andWhere({ id: subjectId }, subjectVisibilityWhere(currentUser)),
    select: { id: true, name: true, ico: true },
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
function safeStorageUrl(value: string): string {
  if (!isSafeHttpUrl(value)) {
    throw new Error("Odkaz musí být platná http(s) adresa.");
  }
  return value;
}

async function resolveStorage(
  formData: FormData,
  folderSegments: string[],
): Promise<{ storageUrl: string; mimeType: string | null }> {
  const url = optionalString(formData, "storageUrl");
  const candidate = formData.get("file");
  const file = candidate instanceof File && candidate.size > 0 ? candidate : null;

  if (file && url) {
    throw new Error("Vyberte buď soubor k nahrání, nebo existující odkaz, ne obojí.");
  }
  if (!file) {
    if (!url) {
      throw new Error("Nahrajte soubor nebo vložte odkaz do SharePointu.");
    }
    return { storageUrl: safeStorageUrl(url), mimeType: null };
  }
  if (!isSharepointUploadConfigured()) {
    throw new Error(
      "Přímý upload vyžaduje konfiguraci SharePointu a Microsoft Graph.",
    );
  }
  if (file.size > MAX_SHAREPOINT_FILE_BYTES) {
    throw new Error("Soubor je větší než povolené 4 MB.");
  }

  const filename = uniqueSharepointFilename(
    file.name,
    crypto.randomUUID().slice(0, 8),
  );
  const mimeType = file.type || "application/octet-stream";
  const uploadedUrl = await uploadSharepointFile(
    [...folderSegments, "Dokumenty"],
    filename,
    await file.arrayBuffer(),
    mimeType,
  );
  if (!uploadedUrl) {
    throw new Error("Soubor se nepodařilo nahrát do SharePointu.");
  }
  return { storageUrl: safeStorageUrl(uploadedUrl), mimeType };
}

// Exactly one of caseId/subjectId must be set (mirrors the DB CHECK). Both are
// validated against the caller's visibility so a document can't be hung on a
// case/subject from another org.
async function resolveAnchor(
  currentUser: CurrentUser,
  formData: FormData,
): Promise<{
  caseId: string | null;
  subjectId: string | null;
  folderSegments: string[];
}> {
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
    return {
      caseId,
      subjectId: null,
      folderSegments: sharepointFolderSegments({
        type: "Case",
        record: legalCase,
      }),
    };
  }

  const subject = await loadVisibleSubject(currentUser, subjectId!);
  if (!subject) {
    throw new Error("Subjekt nenalezen.");
  }
  return {
    caseId: null,
    subjectId,
    folderSegments: sharepointFolderSegments({
      type: "Subject",
      record: subject,
    }),
  };
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

  const { caseId, subjectId, folderSegments } = await resolveAnchor(
    currentUser,
    formData,
  );
  const name = clampText(requiredString(formData, "name"), MAX_NAME)!;
  const kind = enumValue(DocumentKind, formData.get("kind"), DocumentKind.OTHER);
  const description = clampText(optionalString(formData, "description"), MAX_TEXT);
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

  const storage = await resolveStorage(formData, folderSegments);
  const mimeType =
    storage.mimeType ?? clampText(optionalString(formData, "mimeType"), MAX_NAME);
  const storageUrl = storage.storageUrl;

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
        organizationId: currentUser.organizationId,
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
    select: {
      id: true,
      caseId: true,
      subjectId: true,
      archivedAt: true,
      case: {
        select: {
          id: true,
          name: true,
          fileNumber: true,
          project: { select: { id: true, name: true } },
        },
      },
      subject: { select: { id: true, name: true, ico: true } },
    },
  });
  if (!existing) {
    throw new Error("Dokument nenalezen.");
  }
  if (existing.archivedAt) {
    throw new Error("Dokument je archivovaný.");
  }

  const folderSegments = existing.case
    ? sharepointFolderSegments({ type: "Case", record: existing.case })
    : existing.subject
      ? sharepointFolderSegments({ type: "Subject", record: existing.subject })
      : null;
  if (!folderSegments) {
    throw new Error("Dokument nemá platnou vazbu na spis nebo subjekt.");
  }
  const storage = await resolveStorage(formData, folderSegments);
  const storageUrl = storage.storageUrl;
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
      data: {
        currentVersionId: version.id,
        storageUrl,
        ...(storage.mimeType ? { mimeType: storage.mimeType } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
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
        organizationId: currentUser.organizationId,
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
        organizationId: currentUser.organizationId,
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
      organizationId: currentUser.organizationId,
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
        organizationId: currentUser.organizationId,
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
        organizationId: currentUser.organizationId,
        entityType: "DocumentTemplate",
        entityId: templateId,
        action: "ARCHIVE",
        changedById: currentUser.id,
      },
    });
  });

  revalidatePath("/documents/templates");
}
