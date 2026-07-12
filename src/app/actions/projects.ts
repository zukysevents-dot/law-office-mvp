"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ProjectStatus, SubjectRole } from "@/generated/prisma/enums";
import { setArchived } from "@/lib/archive";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  enumValue,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/form";
import { assertUserInOrg } from "@/lib/org-users";
import {
  andWhere,
  assertCanEditRecord,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export async function createProject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const status = enumValue(
    ProjectStatus,
    formData.get("status"),
    ProjectStatus.ACTIVE,
  );
  const mainSubjectId = requiredString(formData, "mainSubjectId");
  const responsibleUserId = optionalString(formData, "responsibleUserId");
  await assertUserInOrg(responsibleUserId, currentUser.organizationId);

  const project = await prisma.$transaction(async (tx) => {
    // The main subject must be one the user can see — otherwise a crafted POST
    // could attach (and thereby expose) a subject from another matter/tenant.
    const subject = await tx.subject.findFirst({
      where: andWhere({ id: mainSubjectId }, subjectVisibilityWhere(currentUser)),
      select: { id: true },
    });
    if (!subject) {
      throw new Error("Subjekt nenalezen nebo k němu nemáte oprávnění.");
    }

    const created = await tx.project.create({
      data: {
        organizationId: currentUser.organizationId,
        name: requiredString(formData, "name"),
        mainSubjectId,
        responsibleUserId,
        status,
        hourlyRate: optionalNumber(formData, "hourlyRate"),
        sharepointUrl: optionalString(formData, "sharepointUrl"),
        note: optionalString(formData, "note"),
      },
    });

    await tx.subjectRelation.create({
      data: {
        subjectId: mainSubjectId,
        relationType: "PROJECT",
        role: SubjectRole.CLIENT,
        projectId: created.id,
        createdById: currentUser.id,
        note: "Hlavní subjekt projektu",
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Project",
        entityId: created.id,
        action: "CREATE",
        changedById: currentUser.id,
        organizationId: currentUser.organizationId,
        newValue: {
          name: created.name,
          mainSubjectId: created.mainSubjectId,
          status: created.status,
        },
      },
    });

    return created;
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const projectId = requiredString(formData, "id");
  const status = enumValue(
    ProjectStatus,
    formData.get("status"),
    ProjectStatus.ACTIVE,
  );

  const mainSubjectId = requiredString(formData, "mainSubjectId");
  const responsibleUserId = optionalString(formData, "responsibleUserId");

  const oldProject = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { assignees: { select: { userId: true } } },
  });
  assertCanEditRecord(currentUser, "Project", oldProject);
  await assertUserInOrg(responsibleUserId, currentUser.organizationId);

  // Re-pointing the main subject must respect visibility — can't attach a
  // subject the user can't see (IDOR guard, mirrors createProject).
  const subject = await prisma.subject.findFirst({
    where: andWhere({ id: mainSubjectId }, subjectVisibilityWhere(currentUser)),
    select: { id: true },
  });
  if (!subject) {
    throw new Error("Subjekt nenalezen nebo k němu nemáte oprávnění.");
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      name: requiredString(formData, "name"),
      mainSubjectId,
      responsibleUserId,
      status,
      hourlyRate: optionalNumber(formData, "hourlyRate"),
      sharepointUrl: optionalString(formData, "sharepointUrl"),
      note: optionalString(formData, "note"),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Project",
      entityId: project.id,
      action: "UPDATE",
      changedById: currentUser.id,
      organizationId: currentUser.organizationId,
      oldValue: auditJson(oldProject),
      newValue: auditJson(project),
    },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
  redirect(`/projects/${project.id}`);
}

async function setProjectArchived(formData: FormData, archived: boolean) {
  const prisma = getPrisma();
  const project = await setArchived(formData, "Project", archived, {
    find: (id) => prisma.project.findUniqueOrThrow({ where: { id } }),
    update: (id, data) => prisma.project.update({ where: { id }, data }),
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
}

export async function archiveProject(formData: FormData) {
  await setProjectArchived(formData, true);
}

export async function restoreProject(formData: FormData) {
  await setProjectArchived(formData, false);
}
