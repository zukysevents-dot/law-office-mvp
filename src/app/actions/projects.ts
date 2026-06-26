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
import { assertCanEditRecord } from "@/lib/permissions";
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

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        organizationId: currentUser.organizationId,
        name: requiredString(formData, "name"),
        mainSubjectId,
        responsibleUserId: optionalString(formData, "responsibleUserId"),
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

  const oldProject = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });
  assertCanEditRecord(currentUser, "Project", oldProject);

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      name: requiredString(formData, "name"),
      mainSubjectId: requiredString(formData, "mainSubjectId"),
      responsibleUserId: optionalString(formData, "responsibleUserId"),
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
