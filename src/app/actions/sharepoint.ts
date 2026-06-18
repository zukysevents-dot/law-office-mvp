"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { isGraphConfigured } from "@/lib/microsoft/config";
import { ensureFolderPath } from "@/lib/microsoft/graph-client";
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
 * Derive (and, when Graph is configured, really create) the SharePoint folder
 * for a Subject / Project / Case, then store its URL on the record.
 *
 * Without any Microsoft config this is a safe no-op; with only the SharePoint
 * site URL it stores the convention URL; with Graph credentials it provisions
 * the folder and stores the real `webUrl`.
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
      select: { id: true, name: true, ico: true, sharepointUrl: true },
    });
    assertCanEditRecord(currentUser, "Subject", record);
    input = { type: "Subject", record };
    oldUrl = record.sharepointUrl;
    detailPath = `/subjects/${id}`;
    listPath = "/subjects";
  } else if (entityType === "Project") {
    const record = await prisma.project.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, sharepointUrl: true, responsibleUserId: true },
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
        name: true,
        fileNumber: true,
        sharepointUrl: true,
        responsibleUserId: true,
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

  let graphWebUrl: string | null = null;
  let graphFailed = false;
  if (isGraphConfigured()) {
    try {
      graphWebUrl = await ensureFolderPath(segments);
    } catch {
      // Don't swallow silently — record the failure so the user is told (below).
      graphFailed = true;
    }
  }

  // A real Graph webUrl always wins. Otherwise only fill in a convention URL when
  // nothing is stored yet — never downgrade an existing (possibly real) URL on a
  // stale resubmit or a transient Graph outage.
  let sharepointUrl: string | null;
  if (graphWebUrl) {
    sharepointUrl = graphWebUrl;
  } else if (oldUrl) {
    sharepointUrl = oldUrl;
  } else {
    sharepointUrl = conventionUrl;
  }

  // Nothing could be derived or created (e.g. Graph-only config and Graph failed).
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

  redirect(`${detailPath}${graphFailed ? "?sharepoint=graphFailed" : ""}`);
}
