"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { assertCanAccessModule } from "@/lib/module-access.server";
import {
  andWhere,
  assertCanEditAuthoredEntry,
  caseVisibilityWhere,
  matterCommentVisibilityWhere,
  projectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  richEntryDone,
  richEntryErrorMessage,
  richEntryFailed,
  type RichEntryFormState,
} from "@/lib/rich-entry-form";
import { normalizeRichTextInput } from "@/lib/rich-text";

// Komentáře (záznamy komunikace, např. evidence telefonátů) v detailu projektu
// a případu. Přidat smí každý, kdo projekt/případ vidí; upravit a archivovat
// („smazat“) jen autor. Každá změna jde do audit logu.

type CommentParent = {
  kind: "project" | "case";
  projectId: string | null;
  caseId: string | null;
  organizationId: string;
};

function revalidateParent(parent: {
  projectId: string | null;
  caseId: string | null;
}) {
  if (parent.projectId) {
    revalidatePath(`/projects/${parent.projectId}`);
  }
  if (parent.caseId) {
    revalidatePath(`/cases/${parent.caseId}`);
  }
}

function moduleOf(kind: CommentParent["kind"]) {
  return kind === "case" ? "module.cases" : "module.projects";
}

async function loadCommentForAuthor(id: string) {
  const currentUser = await getCurrentUser();
  const comment = await getPrisma().matterComment.findFirst({
    where: andWhere(
      { id, archivedAt: null },
      matterCommentVisibilityWhere(currentUser),
    ),
    select: {
      id: true,
      organizationId: true,
      authorId: true,
      projectId: true,
      caseId: true,
      body: true,
    },
  });
  if (!comment) {
    throw new Error("Komentář nebyl nalezen nebo k němu nemáte přístup.");
  }
  await assertCanAccessModule(
    currentUser,
    moduleOf(comment.caseId ? "case" : "project"),
  );
  assertCanEditAuthoredEntry(currentUser, comment);
  return { currentUser, comment };
}

export async function addMatterComment(
  _previous: RichEntryFormState,
  formData: FormData,
): Promise<RichEntryFormState> {
  const currentUser = await getCurrentUser();
  try {
    const kind = formData.get("kind") === "case" ? "case" : "project";
    const parentId = requiredString(formData, "parentId");
    await assertCanAccessModule(currentUser, moduleOf(kind));

    const body = normalizeRichTextInput(formData.get("body"));
    if (!body.ok) {
      return richEntryFailed(body.error);
    }

    const prisma = getPrisma();
    let parent: CommentParent | null = null;
    if (kind === "case") {
      const legalCase = await prisma.case.findFirst({
        where: andWhere({ id: parentId }, caseVisibilityWhere(currentUser)),
        select: { id: true, organizationId: true },
      });
      parent = legalCase
        ? {
            kind,
            projectId: null,
            caseId: legalCase.id,
            organizationId: legalCase.organizationId,
          }
        : null;
    } else {
      const project = await prisma.project.findFirst({
        where: andWhere({ id: parentId }, projectVisibilityWhere(currentUser)),
        select: { id: true, organizationId: true },
      });
      parent = project
        ? {
            kind,
            projectId: project.id,
            caseId: null,
            organizationId: project.organizationId,
          }
        : null;
    }
    if (!parent) {
      return richEntryFailed(
        kind === "case"
          ? "Případ nebyl nalezen nebo k němu nemáte přístup."
          : "Projekt nebyl nalezen nebo k němu nemáte přístup.",
      );
    }

    const comment = await prisma.matterComment.create({
      data: {
        organizationId: parent.organizationId,
        projectId: parent.projectId,
        caseId: parent.caseId,
        authorId: currentUser.id,
        body: body.value,
      },
      select: { id: true },
    });

    await writeAuditLog({
      organizationId: parent.organizationId,
      entityType: "MatterComment",
      entityId: comment.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: {
        projectId: parent.projectId,
        caseId: parent.caseId,
        body: body.value,
      },
    });

    revalidateParent(parent);
    return richEntryDone("Komentář byl přidán.");
  } catch (error) {
    return richEntryFailed(richEntryErrorMessage(error));
  }
}

export async function updateMatterComment(
  _previous: RichEntryFormState,
  formData: FormData,
): Promise<RichEntryFormState> {
  try {
    const { currentUser, comment } = await loadCommentForAuthor(
      requiredString(formData, "id"),
    );
    const body = normalizeRichTextInput(formData.get("body"));
    if (!body.ok) {
      return richEntryFailed(body.error);
    }
    if (body.value === comment.body) {
      return richEntryDone("Text se nezměnil.");
    }

    await getPrisma().matterComment.update({
      where: { id: comment.id },
      data: { body: body.value, editedAt: new Date() },
    });

    await writeAuditLog({
      organizationId: comment.organizationId,
      entityType: "MatterComment",
      entityId: comment.id,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: { body: comment.body },
      newValue: { body: body.value },
    });

    revalidateParent(comment);
    return richEntryDone("Komentář byl upraven.");
  } catch (error) {
    return richEntryFailed(richEntryErrorMessage(error));
  }
}

// „Smazat“ = archivovat (záznam zůstává v databázi i v audit logu).
export async function archiveMatterComment(formData: FormData) {
  const { currentUser, comment } = await loadCommentForAuthor(
    requiredString(formData, "id"),
  );

  await getPrisma().matterComment.update({
    where: { id: comment.id },
    data: { archivedAt: new Date() },
  });

  await writeAuditLog({
    organizationId: comment.organizationId,
    entityType: "MatterComment",
    entityId: comment.id,
    action: "ARCHIVE",
    changedById: currentUser.id,
    oldValue: { body: comment.body },
  });

  revalidateParent(comment);
}
