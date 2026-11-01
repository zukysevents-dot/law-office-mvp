"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { optionalString, requiredString } from "@/lib/form";
import { assertCanAccessModule } from "@/lib/module-access.server";
import { assertUserInOrg } from "@/lib/org-users";
import {
  andWhere,
  assertCanEditAuthoredEntry,
  taskVisibilityWhere,
  workFeedbackVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  richEntryDone,
  richEntryErrorMessage,
  richEntryFailed,
  type RichEntryFormState,
} from "@/lib/rich-entry-form";
import { normalizeRichTextInput } from "@/lib/rich-text";

// Práce → Zpětná vazba. Kolega píše zpětnou vazbu k práci jiného uživatele,
// volitelně s odkazem na úkol a/nebo výkaz práce — jen na záznam, který sám
// vidí. Vidí ji autor, příjemce a ADMIN/PARTNER (workFeedbackVisibilityWhere);
// upravit a archivovat („smazat“) ji smí jen autor.

const FEEDBACK_PATH = "/feedback";

async function loadFeedbackForAuthor(id: string) {
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.workLogs");
  const feedback = await getPrisma().workFeedback.findFirst({
    where: andWhere(
      { id, archivedAt: null },
      workFeedbackVisibilityWhere(currentUser),
    ),
    select: {
      id: true,
      organizationId: true,
      authorId: true,
      recipientId: true,
      body: true,
    },
  });
  if (!feedback) {
    throw new Error("Zpětná vazba nebyla nalezena nebo k ní nemáte přístup.");
  }
  assertCanEditAuthoredEntry(currentUser, feedback);
  return { currentUser, feedback };
}

export async function addWorkFeedback(
  _previous: RichEntryFormState,
  formData: FormData,
): Promise<RichEntryFormState> {
  const currentUser = await getCurrentUser();
  try {
    await assertCanAccessModule(currentUser, "module.workLogs");
    const organizationId = currentUser.organizationId;
    if (!organizationId) {
      return richEntryFailed("Nejste členem žádné kanceláře.");
    }

    const recipientId = optionalString(formData, "recipientId");
    if (!recipientId) {
      return richEntryFailed("Vyberte, komu je zpětná vazba určena.");
    }
    if (recipientId === currentUser.id) {
      return richEntryFailed("Zpětnou vazbu nelze adresovat sám sobě.");
    }
    await assertUserInOrg(recipientId, organizationId);

    const body = normalizeRichTextInput(formData.get("body"));
    if (!body.ok) {
      return richEntryFailed(body.error);
    }

    const prisma = getPrisma();
    const taskId = optionalString(formData, "taskId");
    if (taskId) {
      const task = await prisma.task.findFirst({
        where: andWhere({ id: taskId }, taskVisibilityWhere(currentUser)),
        select: { id: true },
      });
      if (!task) {
        return richEntryFailed("Vybraný úkol nebyl nalezen nebo k němu nemáte přístup.");
      }
    }
    const workLogId = optionalString(formData, "workLogId");
    if (workLogId) {
      const workLog = await prisma.workLog.findFirst({
        where: andWhere({ id: workLogId }, workLogVisibilityWhere(currentUser)),
        select: { id: true },
      });
      if (!workLog) {
        return richEntryFailed(
          "Vybraný výkaz práce nebyl nalezen nebo k němu nemáte přístup.",
        );
      }
    }

    const feedback = await prisma.workFeedback.create({
      data: {
        organizationId,
        authorId: currentUser.id,
        recipientId,
        body: body.value,
        taskId,
        workLogId,
      },
      select: { id: true },
    });

    await writeAuditLog({
      organizationId,
      entityType: "WorkFeedback",
      entityId: feedback.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: { recipientId, taskId, workLogId, body: body.value },
    });

    revalidatePath(FEEDBACK_PATH);
    return richEntryDone("Zpětná vazba byla uložena.");
  } catch (error) {
    return richEntryFailed(richEntryErrorMessage(error));
  }
}

export async function updateWorkFeedback(
  _previous: RichEntryFormState,
  formData: FormData,
): Promise<RichEntryFormState> {
  try {
    const { currentUser, feedback } = await loadFeedbackForAuthor(
      requiredString(formData, "id"),
    );
    const body = normalizeRichTextInput(formData.get("body"));
    if (!body.ok) {
      return richEntryFailed(body.error);
    }
    if (body.value === feedback.body) {
      return richEntryDone("Text se nezměnil.");
    }

    await getPrisma().workFeedback.update({
      where: { id: feedback.id },
      data: { body: body.value, editedAt: new Date() },
    });

    await writeAuditLog({
      organizationId: feedback.organizationId,
      entityType: "WorkFeedback",
      entityId: feedback.id,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: { body: feedback.body },
      newValue: { body: body.value },
    });

    revalidatePath(FEEDBACK_PATH);
    return richEntryDone("Zpětná vazba byla upravena.");
  } catch (error) {
    return richEntryFailed(richEntryErrorMessage(error));
  }
}

// „Smazat“ = archivovat (záznam zůstává v databázi i v audit logu).
export async function archiveWorkFeedback(formData: FormData) {
  const { currentUser, feedback } = await loadFeedbackForAuthor(
    requiredString(formData, "id"),
  );

  await getPrisma().workFeedback.update({
    where: { id: feedback.id },
    data: { archivedAt: new Date() },
  });

  await writeAuditLog({
    organizationId: feedback.organizationId,
    entityType: "WorkFeedback",
    entityId: feedback.id,
    action: "ARCHIVE",
    changedById: currentUser.id,
    oldValue: { recipientId: feedback.recipientId, body: feedback.body },
  });

  revalidatePath(FEEDBACK_PATH);
}
