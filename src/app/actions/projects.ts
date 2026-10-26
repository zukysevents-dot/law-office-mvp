"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ProjectStatus, SubjectRole } from "@/generated/prisma/enums";
import { setArchived } from "@/lib/archive";
import { projectAssignmentInclude } from "@/lib/assignments";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  enumValue,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/form";
import {
  assignToMatters,
  resolveAssignee,
} from "@/lib/matter-assignments.server";
import { assertUserInOrg } from "@/lib/org-users";
import {
  andWhere,
  assertCanEditRecord,
  canViewRates,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { assertCanAccessModule } from "@/lib/module-access.server";

export async function createProject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.projects");
  const status = enumValue(
    ProjectStatus,
    formData.get("status"),
    ProjectStatus.ACTIVE,
  );
  const mainSubjectId = requiredString(formData, "mainSubjectId");
  const responsibleUserId = optionalString(formData, "responsibleUserId");
  await assertUserInOrg(responsibleUserId, currentUser.organizationId);
  // Volitelný „Tým řešitelů“: ověřený (aktivní tým kanceláře) ještě před
  // založením, aby chybný výběr nenechal projekt bez zamýšleného týmu.
  const legalTeamId = optionalString(formData, "legalTeamId");
  const team = legalTeamId
    ? await resolveAssignee(prisma, currentUser, { kind: "team", id: legalTeamId })
    : null;

  const { project, clientName } = await prisma.$transaction(async (tx) => {
    // The main subject must be one the user can see — otherwise a crafted POST
    // could attach (and thereby expose) a subject from another matter/tenant.
    const subject = await tx.subject.findFirst({
      where: andWhere({ id: mainSubjectId }, subjectVisibilityWhere(currentUser)),
      select: { id: true, name: true },
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
        // Rate only from users who may see rates; otherwise create leaves it
        // empty and update keeps the stored value.
        ...(canViewRates(currentUser)
          ? { hourlyRate: optionalNumber(formData, "hourlyRate") }
          : {}),
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

    return { project: created, clientName: subject.name };
  });

  if (team) {
    await assignToMatters(
      prisma,
      currentUser,
      [
        {
          kind: "project",
          id: project.id,
          name: project.name,
          clientName,
          organizationId: project.organizationId,
          projectId: null,
        },
      ],
      team,
    );
    revalidatePath("/settings/assignments");
  }

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.projects");
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
    include: projectAssignmentInclude,
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
      // Rate only from users who may see rates; otherwise create leaves it
      // empty and update keeps the stored value.
      ...(canViewRates(currentUser)
        ? { hourlyRate: optionalNumber(formData, "hourlyRate") }
        : {}),
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
      // Týmová přiřazení (vč. členů) do auditu úpravy projektu nepatří.
      oldValue: auditJson({ ...oldProject, teamAssignments: undefined }),
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
