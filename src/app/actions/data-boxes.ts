"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import {
  DataMessageDirection,
  DataMessageStatus,
  ModuleKey,
} from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  enumValue,
  optionalDate,
  optionalString,
  requiredString,
} from "@/lib/form";
import {
  andWhere,
  assertCanAdministerOrg,
  assertCanManageDataBoxes,
  caseVisibilityWhere,
  dataMessageVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

// Attachment links are user-supplied free text. Allow only https to avoid an
// open-redirect / javascript:/data: vector when we hand the user off to the URL.
function assertSafeStorageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Neplatný odkaz přílohy.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Odkaz přílohy musí být přes HTTPS.");
  }
}

// Save the office's data-box account. ADMIN/PARTNER only. Credentials are stored
// ONLY as an encrypted blob — never plaintext, never in the audit log.
export async function saveDataBoxAccount(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DATA_BOXES);
  assertCanAdministerOrg(currentUser, currentUser.organizationId);

  if (!isEncryptionConfigured()) {
    throw new Error(
      "Šifrovací klíč (DATA_ENCRYPTION_KEY) není nastaven — přihlašovací údaje k datové schránce nelze bezpečně uložit.",
    );
  }

  const organizationId = currentUser.organizationId;
  const boxId = requiredString(formData, "boxId");
  const label = requiredString(formData, "label");
  const username = optionalString(formData, "username");
  const password = optionalString(formData, "password");
  const hasCredentials = Boolean(username && password);

  const previous = await prisma.dataBoxAccount.findUnique({
    where: { organizationId_boxId: { organizationId, boxId } },
  });
  if (!previous && !hasCredentials) {
    throw new Error("Pro nový přístup zadejte přihlašovací jméno i heslo.");
  }
  // Only (re)encrypt when credentials are supplied; a label-only edit must NOT
  // wipe the stored credentials.
  const credentialsEncrypted = hasCredentials
    ? encryptSecret(JSON.stringify({ username, password }))
    : undefined;

  await prisma.$transaction(async (tx) => {
    const saved = previous
      ? await tx.dataBoxAccount.update({
          where: { id: previous.id },
          data: { label, ...(credentialsEncrypted ? { credentialsEncrypted } : {}) },
        })
      : await tx.dataBoxAccount.create({
          data: {
            organizationId,
            boxId,
            label,
            credentialsEncrypted: credentialsEncrypted as string,
            createdById: currentUser.id,
          },
        });

    await tx.auditLog.create({
      data: {
        entityType: "DataBoxAccount",
        entityId: saved.id,
        action: previous ? "UPDATE" : "CREATE",
        changedById: currentUser.id,
        // Metadata only — credentials are NEVER logged.
        newValue: auditJson({ boxId, label, status: saved.status }),
      },
    });
  });

  revalidatePath("/settings/data-boxes");
}

// MVP path that delivers value without a real ISDS connection: manually record a
// received/sent data message (evidence + assignment). Deduped on (org, dmId).
export async function addManualMessage(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DATA_BOXES);
  assertCanManageDataBoxes(currentUser);

  const organizationId = currentUser.organizationId;
  const direction = enumValue(
    DataMessageDirection,
    formData.get("direction"),
    DataMessageDirection.IN,
  );
  const messageSubject = requiredString(formData, "messageSubject");
  const dmId = optionalString(formData, "dmId");
  const senderBoxId = optionalString(formData, "senderBoxId");
  const recipientBoxId = optionalString(formData, "recipientBoxId");
  const deliveredAt = optionalDate(formData, "deliveredAt");
  const status = enumValue(
    DataMessageStatus,
    formData.get("status"),
    direction === DataMessageDirection.OUT
      ? DataMessageStatus.SENT
      : DataMessageStatus.RECEIVED,
  );
  const note = optionalString(formData, "note");
  const attachmentUrl = optionalString(formData, "attachmentUrl");
  const attachmentFileName = optionalString(formData, "attachmentFileName");
  if (attachmentUrl) {
    assertSafeStorageUrl(attachmentUrl);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.dataMessage.create({
        data: {
          organizationId,
          direction,
          dmId,
          senderBoxId,
          recipientBoxId,
          messageSubject,
          status,
          deliveredAt,
          source: "MANUAL",
          note,
          createdById: currentUser.id,
          attachments: attachmentUrl
            ? {
                create: [
                  {
                    organizationId,
                    fileName: attachmentFileName ?? "Příloha",
                    storageUrl: attachmentUrl,
                  },
                ],
              }
            : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: "DataMessage",
          entityId: created.id,
          action: "CREATE",
          changedById: currentUser.id,
          // Metadata only — keep the message subject (privileged) out of audit.
          newValue: auditJson({ direction, dmId }),
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("Zpráva s tímto ID datové zprávy je už evidována.");
    }
    throw error;
  }

  revalidatePath("/data-boxes");
}

// Assign a data message to a case and/or subject. Verifies the message AND the
// target are within the user's visibility (cross-org/cross-visibility safe).
export async function assignToCase(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DATA_BOXES);
  assertCanManageDataBoxes(currentUser);

  const messageId = requiredString(formData, "messageId");
  const caseId = optionalString(formData, "caseId");
  const subjectId = optionalString(formData, "subjectId");

  const message = await prisma.dataMessage.findFirst({
    where: andWhere(dataMessageVisibilityWhere(currentUser), { id: messageId }),
  });
  if (!message) {
    throw new Error("Datová zpráva nenalezena.");
  }

  if (caseId) {
    const target = await prisma.case.findFirst({
      where: andWhere(caseVisibilityWhere(currentUser), {
        id: caseId,
        archivedAt: null,
      }),
      select: { id: true },
    });
    if (!target) {
      throw new Error("Spis nenalezen, archivovaný, nebo k němu nemáte přístup.");
    }
  }
  if (subjectId) {
    const target = await prisma.subject.findFirst({
      where: andWhere(subjectVisibilityWhere(currentUser), {
        id: subjectId,
        archivedAt: null,
      }),
      select: { id: true },
    });
    if (!target) {
      throw new Error(
        "Subjekt nenalezen, archivovaný, nebo k němu nemáte přístup.",
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.dataMessage.update({
      where: { id: message.id },
      data: { caseId: caseId ?? null, subjectId: subjectId ?? null },
    });

    await tx.auditLog.create({
      data: {
        entityType: "DataMessage",
        entityId: message.id,
        action: "ASSIGN",
        changedById: currentUser.id,
        oldValue: auditJson({
          caseId: message.caseId,
          subjectId: message.subjectId,
        }),
        newValue: auditJson({
          caseId: updated.caseId,
          subjectId: updated.subjectId,
        }),
      },
    });
  });

  // D-8 seam: an inbound delivered message assigned to a case is where F4
  // (Lhůtník) will later propose a procedural deadline from the delivery date.
  // No deadline logic here — the Deadlines module will own it.

  revalidatePath("/data-boxes");
  revalidatePath(`/data-boxes/${message.id}`);
}

// Audit access to an attachment (sensitive DS content) and hand off to the file.
export async function downloadAttachment(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DATA_BOXES);
  assertCanManageDataBoxes(currentUser);

  const attachmentId = requiredString(formData, "attachmentId");
  const attachment = await prisma.dataBoxAttachment.findFirst({
    where: { id: attachmentId, organizationId: currentUser.organizationId },
  });
  if (!attachment) {
    throw new Error("Příloha nenalezena.");
  }
  // The parent message must be visible to this user (role-level visibility).
  const visible = await prisma.dataMessage.findFirst({
    where: andWhere(dataMessageVisibilityWhere(currentUser), {
      id: attachment.dataMessageId,
    }),
    select: { id: true },
  });
  if (!visible) {
    throw new Error("K této příloze nemáte přístup.");
  }
  if (!attachment.storageUrl) {
    throw new Error("Příloha nemá uložený soubor.");
  }
  assertSafeStorageUrl(attachment.storageUrl);

  await prisma.auditLog.create({
    data: {
      entityType: "DataBoxAttachment",
      entityId: attachment.id,
      action: "DOWNLOAD",
      changedById: currentUser.id,
      newValue: auditJson({ fileName: attachment.fileName }),
    },
  });

  redirect(attachment.storageUrl);
}
