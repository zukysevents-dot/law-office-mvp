"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import {
  ensureSharepointFolder,
  isSharepointUploadConfigured,
} from "@/lib/microsoft/graph-drive";
import {
  buildSharepointFolderUrl,
  sharepointFolderSegments,
  type SharepointEntityInput,
  type SharepointEntityType,
} from "@/lib/microsoft/sharepoint";
import { assertCanEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

const ENTITY_TYPES: SharepointEntityType[] = ["Subject", "Project", "Case"];

/**
 * Derive the SharePoint folder URL (from the naming convention) for a Subject /
 * Project / Case and store it on the record.
 *
 * Without SharePoint config this is a safe no-op; with the SharePoint site URL
 * configured it stores the convention URL.
 */
export async function provisionSharepointFolder(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();

  const rawType = requiredString(formData, "entityType");
  if (!ENTITY_TYPES.includes(rawType as SharepointEntityType)) {
    throw new Error("Neznámý typ záznamu pro SharePoint složku.");
  }
  const entityType = rawType as SharepointEntityType;
  const id = requiredString(formData, "id");

  let input: SharepointEntityInput;
  let oldUrl: string | null;
  let detailPath: string;
  let listPath: string;

  if (entityType === "Subject") {
    const record = await prisma.subject.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        name: true,
        ico: true,
        sharepointUrl: true,
      },
    });
    assertCanEditRecord(currentUser, "Subject", record);
    input = { type: "Subject", record };
    oldUrl = record.sharepointUrl;
    detailPath = `/subjects/${id}`;
    listPath = "/subjects";
  } else if (entityType === "Project") {
    const record = await prisma.project.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        name: true,
        sharepointUrl: true,
        responsibleUserId: true,
        assignees: { select: { userId: true } },
      },
    });
    assertCanEditRecord(currentUser, "Project", record);
    input = { type: "Project", record: { id: record.id, name: record.name } };
    oldUrl = record.sharepointUrl;
    detailPath = `/projects/${id}`;
    listPath = "/projects";
  } else {
    const record = await prisma.case.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        name: true,
        fileNumber: true,
        sharepointUrl: true,
        responsibleUserId: true,
        assignees: { select: { userId: true } },
        project: { select: { id: true, name: true } },
      },
    });
    assertCanEditRecord(currentUser, "Case", record);
    input = {
      type: "Case",
      record: {
        id: record.id,
        name: record.name,
        fileNumber: record.fileNumber,
        project: record.project,
      },
    };
    oldUrl = record.sharepointUrl;
    detailPath = `/cases/${id}`;
    listPath = "/cases";
  }

  const segments = sharepointFolderSegments(input);
  const conventionUrl = buildSharepointFolderUrl(segments);

  // With Graph configured, actually CREATE the folder and use its real webUrl.
  // Without Graph it stays URL-only (today's convention behavior).
  let createdUrl: string | null = null;
  let graphFailed = false;
  if (isSharepointUploadConfigured()) {
    try {
      createdUrl = await ensureSharepointFolder(segments);
    } catch {
      graphFailed = true;
    }
  }

  // Graph was supposed to create the folder but failed — don't silently store a
  // convention URL that may not match the (possibly partially created) folder.
  // Surface the failure so the user can retry instead of getting a dead link.
  if (graphFailed && !oldUrl) {
    redirect(`${detailPath}?sharepoint=failed`);
  }

  // Only fill in a URL when nothing is stored yet — never overwrite an existing
  // URL on a stale resubmit. Prefer the real (created) folder URL.
  const sharepointUrl = oldUrl ?? createdUrl ?? conventionUrl;

  // Nothing could be derived (SharePoint site URL not configured).
  if (!sharepointUrl) {
    redirect(`${detailPath}?sharepoint=failed`);
  }

  if (sharepointUrl !== oldUrl) {
    if (entityType === "Subject") {
      await prisma.subject.update({ where: { id }, data: { sharepointUrl } });
    } else if (entityType === "Project") {
      await prisma.project.update({ where: { id }, data: { sharepointUrl } });
    } else {
      await prisma.case.update({ where: { id }, data: { sharepointUrl } });
    }

    await writeAuditLog({
      entityType,
      entityId: id,
      action: "SHAREPOINT_FOLDER",
      changedById: currentUser.id,
      oldValue: { sharepointUrl: oldUrl },
      newValue: { sharepointUrl },
    });

    revalidatePath(listPath);
    revalidatePath(detailPath);
  }

  redirect(detailPath);
}
