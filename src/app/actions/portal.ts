"use server";

import { revalidatePath } from "next/cache";

import {
  ModuleKey,
  PortalAccessStatus,
  PortalShareType,
} from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import { requiredString } from "@/lib/form";
import {
  andWhere,
  assertCanManagePortal,
  caseVisibilityWhere,
  documentVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

async function authorize(): Promise<{
  currentUser: CurrentUser;
  organizationId: string;
}> {
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.CLIENT_PORTAL);
  assertCanManagePortal(currentUser);
  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  return { currentUser, organizationId };
}

// Load a portal access in the caller's org (org isolation for share/revoke).
async function loadOrgPortalAccess(organizationId: string, portalAccessId: string) {
  return getPrisma().portalAccess.findFirst({
    where: { id: portalAccessId, organizationId },
    select: { id: true, subjectId: true },
  });
}

// Grant (or update) portal access for a client subject. email is the magic-link
// identity. Idempotent per subject (subjectId is unique).
export async function ensurePortalAccess(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const subjectId = requiredString(formData, "subjectId");
  const email = requiredString(formData, "email").toLowerCase();
  if (!isSafeEmail(email)) {
    throw new Error("Neplatný e-mail.");
  }

  const subject = await prisma.subject.findFirst({
    where: andWhere({ id: subjectId }, subjectVisibilityWhere(currentUser)),
    select: { id: true },
  });
  if (!subject) {
    throw new Error("Subjekt nenalezen.");
  }

  // The same e-mail can't back two different clients' portal access in one org
  // (@@unique([organizationId, email])). Pre-check for a friendly error instead
  // of a raw P2002 from the upsert.
  const emailClash = await prisma.portalAccess.findFirst({
    where: { organizationId, email, NOT: { subjectId } },
    select: { id: true },
  });
  if (emailClash) {
    throw new Error("Tento e-mail už používá jiný klient.");
  }

  await prisma.$transaction(async (tx) => {
    const access = await tx.portalAccess.upsert({
      where: { subjectId },
      update: {
        email,
        status: PortalAccessStatus.ACTIVE,
        revokedAt: null,
      },
      create: {
        organizationId,
        subjectId,
        email,
        status: PortalAccessStatus.ACTIVE,
        createdById: currentUser.id,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "PortalAccess",
        entityId: access.id,
        action: "PORTAL_ACCESS_GRANT",
        changedById: currentUser.id,
        newValue: auditJson({ subjectId, email }),
      },
    });
  });

  revalidatePath(`/subjects/${subjectId}`);
}

// Revoke a client's portal access and kill all their active sessions.
export async function revokePortalAccess(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const portalAccessId = requiredString(formData, "portalAccessId");
  const access = await loadOrgPortalAccess(organizationId, portalAccessId);
  if (!access) {
    throw new Error("Přístup nenalezen.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.portalAccess.update({
      where: { id: portalAccessId },
      data: { status: PortalAccessStatus.REVOKED, revokedAt: new Date() },
    });
    await tx.portalSession.updateMany({
      where: { portalAccessId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        entityType: "PortalAccess",
        entityId: portalAccessId,
        action: "PORTAL_ACCESS_REVOKE",
        changedById: currentUser.id,
      },
    });
  });

  revalidatePath(`/subjects/${access.subjectId}`);
}

// Share a document with a client (whitelist). The document must be visible to the
// caller and in the same org as the access.
export async function shareDocument(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const portalAccessId = requiredString(formData, "portalAccessId");
  const documentId = requiredString(formData, "documentId");

  const access = await loadOrgPortalAccess(organizationId, portalAccessId);
  if (!access) {
    throw new Error("Přístup nenalezen.");
  }
  const document = await prisma.document.findFirst({
    where: andWhere({ id: documentId }, documentVisibilityWhere(currentUser)),
    select: { id: true },
  });
  if (!document) {
    throw new Error("Dokument nenalezen.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.portalShare.upsert({
      where: { portalAccessId_documentId: { portalAccessId, documentId } },
      update: { revokedAt: null, sharedById: currentUser.id },
      create: {
        organizationId,
        portalAccessId,
        shareType: PortalShareType.DOCUMENT,
        documentId,
        sharedById: currentUser.id,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "PortalShare",
        entityId: documentId,
        action: "PORTAL_SHARE_DOCUMENT",
        changedById: currentUser.id,
        newValue: auditJson({ portalAccessId, documentId }),
      },
    });
  });

  revalidatePath(`/documents/${documentId}`);
  revalidatePath(`/subjects/${access.subjectId}`);
}

// Share a case (status overview) with a client.
export async function shareCase(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const portalAccessId = requiredString(formData, "portalAccessId");
  const caseId = requiredString(formData, "caseId");

  const access = await loadOrgPortalAccess(organizationId, portalAccessId);
  if (!access) {
    throw new Error("Přístup nenalezen.");
  }
  const legalCase = await prisma.case.findFirst({
    where: andWhere({ id: caseId }, caseVisibilityWhere(currentUser)),
    select: { id: true },
  });
  if (!legalCase) {
    throw new Error("Případ nenalezen.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.portalShare.upsert({
      where: { portalAccessId_caseId: { portalAccessId, caseId } },
      update: { revokedAt: null, sharedById: currentUser.id },
      create: {
        organizationId,
        portalAccessId,
        shareType: PortalShareType.CASE,
        caseId,
        sharedById: currentUser.id,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "PortalShare",
        entityId: caseId,
        action: "PORTAL_SHARE_CASE",
        changedById: currentUser.id,
        newValue: auditJson({ portalAccessId, caseId }),
      },
    });
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/subjects/${access.subjectId}`);
}

// Revoke a single share (soft — keeps the audit trail).
export async function revokeShare(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const shareId = requiredString(formData, "shareId");
  const share = await prisma.portalShare.findFirst({
    where: { id: shareId, organizationId },
    select: {
      id: true,
      documentId: true,
      caseId: true,
      portalAccess: { select: { subjectId: true } },
    },
  });
  if (!share) {
    throw new Error("Sdílení nenalezeno.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.portalShare.update({
      where: { id: shareId },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        entityType: "PortalShare",
        entityId: shareId,
        action: "PORTAL_REVOKE_SHARE",
        changedById: currentUser.id,
      },
    });
  });

  revalidatePath(`/subjects/${share.portalAccess.subjectId}`);
  if (share.documentId) {
    revalidatePath(`/documents/${share.documentId}`);
  }
  if (share.caseId) {
    revalidatePath(`/cases/${share.caseId}`);
  }
}

// Minimal email shape check — full RFC validation isn't the goal; we just reject
// obviously-wrong input before storing it as the magic-link identity.
function isSafeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
