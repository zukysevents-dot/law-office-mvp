"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ModuleKey } from "@/generated/prisma/enums";
import { auditJson, writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import { optionalString, requiredString } from "@/lib/form";
import {
  deleteSharepointItemByPath,
  ensureSharepointFolder,
  invalidateSharepointDriveIndex,
  isSharepointUploadConfigured,
  uploadSharepointFile,
} from "@/lib/microsoft/graph-drive";
import {
  matterBrowsePath,
  parseEntityType,
  resolveMatterFolder,
} from "@/lib/microsoft/matter-folder";
import {
  parseRelativePath,
  sanitizeSegment,
  uniqueSharepointFilename,
} from "@/lib/microsoft/sharepoint";
import { assertCanEditRecord, canManageDocuments } from "@/lib/permissions";

// Simple Graph PUT upload strop; větší soubory by potřebovaly upload session.
const MAX_SHAREPOINT_FILE_BYTES = 4 * 1024 * 1024;

type Target = {
  organizationId: string;
  userId: string;
  matter: Awaited<ReturnType<typeof resolveMatterFolder>> & object;
  /** Kořen spisu + validovaná relativní cesta — sestaveno serverem. */
  segments: string[];
  relativePath: string;
  browsePath: string;
};

/**
 * Společná hlava všech tří akcí: ověřit modul, načíst spis přes visibility
 * helper, ověřit právo editace a sestavit cestu ke složce.
 */
async function authorizeFolder(formData: FormData): Promise<Target> {
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);

  const type = parseEntityType(requiredString(formData, "entityType"));
  if (!type) {
    throw new Error("Neznámý typ záznamu.");
  }
  const id = requiredString(formData, "id");
  const matter = await resolveMatterFolder(type, id);
  if (!matter) {
    throw new Error("Záznam nenalezen nebo k němu nemáte přístup.");
  }
  // resolveMatterFolder už filtruje viditelnost; tohle navíc hlídá právo ZÁPISU
  // (advokát smí zapisovat jen do svých spisů, koncipient/stážista do žádného).
  assertCanEditRecord(currentUser, type, matter.editRecord);

  const relativeSegments = parseRelativePath(optionalString(formData, "path"));
  const relativePath = relativeSegments.join("/");
  return {
    organizationId: currentUser.organizationId,
    userId: currentUser.id,
    matter,
    segments: [...matter.rootSegments, ...relativeSegments],
    relativePath,
    browsePath: matterBrowsePath(type, matter.id, relativePath),
  };
}

async function assertConfigured(organizationId: string): Promise<void> {
  if (!(await isSharepointUploadConfigured(organizationId))) {
    throw new Error(
      "SharePoint není pro vaši kancelář připojený (Nastavení → SharePoint).",
    );
  }
}

/** Nahraje soubor do aktuálně prohlížené složky (max 4 MB). */
export async function uploadToSharepointFolder(formData: FormData) {
  const target = await authorizeFolder(formData);
  await assertConfigured(target.organizationId);

  const candidate = formData.get("file");
  const file = candidate instanceof File && candidate.size > 0 ? candidate : null;
  if (!file) {
    throw new Error("Vyberte soubor k nahrání.");
  }
  if (file.size > MAX_SHAREPOINT_FILE_BYTES) {
    throw new Error("Soubor je větší než povolené 4 MB.");
  }

  // Unikátní název, ať prostý PUT nepřepíše stejnojmenný existující soubor.
  const filename = uniqueSharepointFilename(
    file.name,
    crypto.randomUUID().slice(0, 8),
  );
  const uploadedUrl = await uploadSharepointFile(
    target.organizationId,
    target.segments,
    filename,
    await file.arrayBuffer(),
    file.type || "application/octet-stream",
  );
  if (!uploadedUrl) {
    throw new Error("Soubor se nepodařilo nahrát do SharePointu.");
  }

  await writeAuditLog({
    organizationId: target.organizationId,
    entityType: target.matter.type,
    entityId: target.matter.id,
    action: "SHAREPOINT_UPLOAD",
    changedById: target.userId,
    newValue: auditJson({ path: target.relativePath, filename }),
  });

  invalidateSharepointDriveIndex();
  revalidatePath(target.browsePath);
  redirect(target.browsePath);
}

/** Založí podsložku v aktuálně prohlížené složce. */
export async function createSharepointSubfolder(formData: FormData) {
  const target = await authorizeFolder(formData);
  await assertConfigured(target.organizationId);

  const name = sanitizeSegment(requiredString(formData, "name"));
  if (!name) {
    throw new Error("Název složky nesmí být prázdný.");
  }
  const created = await ensureSharepointFolder(target.organizationId, [
    ...target.segments,
    name,
  ]);
  if (!created) {
    throw new Error("Složku se nepodařilo založit.");
  }

  await writeAuditLog({
    organizationId: target.organizationId,
    entityType: target.matter.type,
    entityId: target.matter.id,
    action: "SHAREPOINT_FOLDER",
    changedById: target.userId,
    newValue: auditJson({ path: target.relativePath, name }),
  });

  invalidateSharepointDriveIndex();
  revalidatePath(target.browsePath);
  redirect(target.browsePath);
}

/**
 * Smaže položku z aktuálně prohlížené složky.
 *
 * Akce záměrně NEPŘIJÍMÁ Graph itemId — to by šlo podvrhnout z cizí složky.
 * Bere jen NÁZEV, sanitizuje ho a připojí k cestě sestavené serverem z kořene
 * spisu. Z takové cesty se nedá uniknout, protože kořen ani ".." do ní nikdy
 * nevstoupí.
 */
export async function deleteSharepointItem(formData: FormData) {
  const currentUser = await getCurrentUser();
  const target = await authorizeFolder(formData);
  if (!canManageDocuments(currentUser)) {
    throw new Error("Nemáte oprávnění mazat soubory v SharePointu.");
  }
  await assertConfigured(target.organizationId);

  const name = sanitizeSegment(requiredString(formData, "name"));
  if (!name) {
    throw new Error("Chybí název mazané položky.");
  }
  const deleted = await deleteSharepointItemByPath(target.organizationId, [
    ...target.segments,
    name,
  ]);
  if (deleted === null) {
    throw new Error("SharePoint není pro vaši kancelář připojený.");
  }

  await writeAuditLog({
    organizationId: target.organizationId,
    entityType: target.matter.type,
    entityId: target.matter.id,
    action: "SHAREPOINT_DELETE",
    changedById: target.userId,
    newValue: auditJson({
      path: target.relativePath,
      name,
      existed: deleted,
    }),
  });

  invalidateSharepointDriveIndex();
  revalidatePath(target.browsePath);
  redirect(target.browsePath);
}
