"use server";

import { revalidatePath } from "next/cache";

import { SubjectRole } from "@/generated/prisma/enums";
import {
  caseAssignmentInclude,
  projectAssignmentInclude,
} from "@/lib/assignments";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { enumValue, optionalString, requiredString } from "@/lib/form";
import {
  andWhere,
  assertCanEditRecord,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  normalizeRelationNote,
  relationRemovalError,
  relationRoleChangeError,
} from "@/lib/subject-relations";

export async function addProjectSubjectRelation(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const projectId = requiredString(formData, "projectId");
  const subjectId = requiredString(formData, "subjectId");
  const role = enumValue(SubjectRole, formData.get("role"), SubjectRole.CLIENT);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: projectAssignmentInclude,
  });
  assertCanEditRecord(currentUser, "Project", project);

  // The subject must be one the user can see — otherwise attaching it here would
  // leak the subject's data via the relation (IDOR / cross-tenant guard).
  const subject = await prisma.subject.findFirst({
    where: andWhere({ id: subjectId }, subjectVisibilityWhere(currentUser)),
    select: { id: true },
  });
  if (!subject) {
    throw new Error("Subjekt nenalezen nebo k němu nemáte oprávnění.");
  }

  await prisma.subjectRelation.create({
    data: {
      subjectId,
      projectId,
      relationType: "PROJECT",
      role,
      note: optionalString(formData, "note"),
      createdById: currentUser.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "SubjectRelation",
      entityId: projectId,
      action: "CREATE_PROJECT_RELATION",
      changedById: currentUser.id,
      organizationId: currentUser.organizationId,
      newValue: {
        subjectId,
        projectId,
        relationType: "PROJECT",
        role,
      },
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/conflict-check");
}

export async function addCaseSubjectRelation(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const caseId = requiredString(formData, "caseId");
  const subjectId = requiredString(formData, "subjectId");
  const role = enumValue(SubjectRole, formData.get("role"), SubjectRole.CLIENT);
  const legalCase = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: caseAssignmentInclude,
  });
  assertCanEditRecord(currentUser, "Case", legalCase);
  // projectId is authoritative on the already-authorized case. Never trust the
  // hidden form field here: a crafted POST could otherwise attach this subject
  // to an unrelated (including cross-tenant) project and expose it on that
  // project's detail page through SubjectRelation.
  const projectId = legalCase.projectId;

  // The subject must be one the user can see — otherwise attaching it here would
  // leak the subject's data via the relation (IDOR / cross-tenant guard).
  const subject = await prisma.subject.findFirst({
    where: andWhere({ id: subjectId }, subjectVisibilityWhere(currentUser)),
    select: { id: true },
  });
  if (!subject) {
    throw new Error("Subjekt nenalezen nebo k němu nemáte oprávnění.");
  }

  await prisma.subjectRelation.create({
    data: {
      subjectId,
      caseId,
      projectId,
      relationType: "CASE",
      role,
      note: optionalString(formData, "note"),
      createdById: currentUser.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "SubjectRelation",
      entityId: caseId,
      action: "CREATE_CASE_RELATION",
      changedById: currentUser.id,
      organizationId: currentUser.organizationId,
      newValue: {
        subjectId,
        caseId,
        projectId,
        relationType: "CASE",
        role,
      },
    },
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/conflict-check");
}

export type RelationFormState = {
  ok: boolean;
  message?: string;
  error?: string;
  // Mění se při každém odeslání — klient podle ní zavře dialog.
  version: number;
};

function relationFailed(error: unknown): RelationFormState {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Uložení se nezdařilo.",
    version: Date.now(),
  };
}

// Vazbu smí upravit / odebrat ten, kdo smí upravit záznam, ke kterému patří:
// vazba případu → případ, vazba projektu → projekt. Záznam se vždy načítá
// z vazby (nikdy z formuláře) a assertCanEditRecord hlídá i oddělení kanceláří.
async function loadEditableRelation(relationId: string) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const relation = await prisma.subjectRelation.findUnique({
    where: { id: relationId },
    include: {
      project: { include: projectAssignmentInclude },
      case: {
        include: {
          ...caseAssignmentInclude,
          project: { select: { mainSubjectId: true } },
        },
      },
    },
  });
  if (!relation) {
    throw new Error("Vazba subjektu nebyla nalezena.");
  }

  if (relation.caseId) {
    if (!relation.case) {
      throw new Error("Vazba subjektu nebyla nalezena.");
    }
    assertCanEditRecord(currentUser, "Case", relation.case);
  } else if (relation.project) {
    assertCanEditRecord(currentUser, "Project", relation.project);
  } else {
    throw new Error("Vazba subjektu nebyla nalezena.");
  }

  const mainSubjectId =
    relation.case?.project.mainSubjectId ?? relation.project?.mainSubjectId ?? null;
  // Vazba patří kanceláři svého případu / projektu (assert výše ověřil, že je
  // to kancelář uživatele).
  const organizationId = (relation.case ?? relation.project)!.organizationId;

  return { currentUser, relation, mainSubjectId, organizationId };
}

function revalidateRelation(relation: {
  subjectId: string;
  projectId: string | null;
  caseId: string | null;
}) {
  if (relation.caseId) {
    revalidatePath(`/cases/${relation.caseId}`);
  }
  if (relation.projectId) {
    revalidatePath(`/projects/${relation.projectId}`);
  }
  revalidatePath(`/subjects/${relation.subjectId}`);
  revalidatePath("/conflict-check");
}

export async function updateSubjectRelation(
  _previous: RelationFormState,
  formData: FormData,
): Promise<RelationFormState> {
  try {
    const relationId = requiredString(formData, "relationId");
    const { currentUser, relation, mainSubjectId, organizationId } =
      await loadEditableRelation(relationId);
    const role = enumValue(SubjectRole, formData.get("role"), relation.role);
    const note = normalizeRelationNote(formData.get("note"));

    const roleError = relationRoleChangeError(relation, mainSubjectId, role);
    if (roleError) {
      return relationFailed(new Error(roleError));
    }

    if (role === relation.role && note === relation.note) {
      return { ok: true, message: "Beze změn.", version: Date.now() };
    }

    await getPrisma().subjectRelation.update({
      where: { id: relation.id },
      data: { role, note },
    });

    await writeAuditLog({
      organizationId,
      entityType: "SubjectRelation",
      entityId: relation.id,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: {
        subjectId: relation.subjectId,
        projectId: relation.projectId,
        caseId: relation.caseId,
        role: relation.role,
        note: relation.note,
      },
      newValue: {
        subjectId: relation.subjectId,
        projectId: relation.projectId,
        caseId: relation.caseId,
        role,
        note,
      },
    });

    revalidateRelation(relation);
    return { ok: true, message: "Vazba uložena.", version: Date.now() };
  } catch (error) {
    return relationFailed(error);
  }
}

export async function removeSubjectRelation(formData: FormData) {
  const relationId = requiredString(formData, "relationId");
  const { currentUser, relation, mainSubjectId, organizationId } =
    await loadEditableRelation(relationId);

  const removalError = relationRemovalError(relation, mainSubjectId);
  if (removalError) {
    throw new Error(removalError);
  }

  await getPrisma().subjectRelation.delete({ where: { id: relation.id } });

  await writeAuditLog({
    organizationId,
    entityType: "SubjectRelation",
    entityId: relation.id,
    action: "DELETE",
    changedById: currentUser.id,
    oldValue: {
      subjectId: relation.subjectId,
      projectId: relation.projectId,
      caseId: relation.caseId,
      relationType: relation.relationType,
      role: relation.role,
      note: relation.note,
    },
  });

  revalidateRelation(relation);
}
