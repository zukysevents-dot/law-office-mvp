"use server";

import { revalidatePath } from "next/cache";

import {
  parseAssigneeToken,
  projectAssignmentInclude,
} from "@/lib/assignments";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import {
  assignmentRevalidationPaths,
  assignToMatters,
  loadEditableMatter,
  resolveAssignee,
} from "@/lib/matter-assignments.server";
import { assertCanAccessModule } from "@/lib/module-access.server";
import { assertCanEditRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

function revalidateProject(projectId: string) {
  const paths = assignmentRevalidationPaths([
    { kind: "project", id: projectId, name: "", organizationId: "", projectId: null },
  ]);
  for (const path of paths) {
    revalidatePath(path);
  }
}

// Přidání řešitele projektu z detailu: osoba ("user:<id>") nebo celý tým
// ("team:<id>"). Přiřazovat smí ten, kdo smí projekt upravit (ADMIN/PARTNER,
// odpovědný nebo řešitel s „Upravuje svoje projekty a případy“) — stejný gate
// jako editace, žádné nové oprávnění. Přiřazení dostanou notifikaci.
export async function addProjectAssignment(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.projects");
  const projectId = requiredString(formData, "projectId");
  const token = parseAssigneeToken(formData.get("assignee"));
  if (!token) {
    throw new Error("Vyberte tým nebo osobu.");
  }

  const matter = await loadEditableMatter(prisma, currentUser, "project", projectId);
  const assignee = await resolveAssignee(prisma, currentUser, token);
  await assignToMatters(prisma, currentUser, [matter], assignee);

  revalidateProject(projectId);
}

// Starší tvar formuláře (pole `userId`) — deleguje na addProjectAssignment.
export async function addProjectAssignee(formData: FormData) {
  const userId = requiredString(formData, "userId");
  formData.set("assignee", `user:${userId}`);
  await addProjectAssignment(formData);
}

export async function removeProjectAssignee(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.projects");
  const id = requiredString(formData, "id");

  const assignee = await prisma.projectAssignee.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      projectId: true,
      userId: true,
      project: {
        select: {
          id: true,
          organizationId: true,
          responsibleUserId: true,
          ...projectAssignmentInclude,
        },
      },
    },
  });
  assertCanEditRecord(currentUser, "Project", assignee.project);

  await prisma.projectAssignee.delete({ where: { id } });

  await writeAuditLog({
    organizationId: currentUser.organizationId,
    entityType: "ProjectAssignee",
    entityId: id,
    action: "DELETE",
    changedById: currentUser.id,
    oldValue: { projectId: assignee.projectId, userId: assignee.userId },
  });

  revalidateProject(assignee.projectId);
}

// Odebrání týmu z řešitelů projektu. Členové tím ztratí přístup, pokud ho
// nemají jinak (osobně, přes jiný tým nebo jako odpovědní).
export async function removeProjectTeamAssignment(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.projects");
  const id = requiredString(formData, "id");

  const assignment = await prisma.projectTeamAssignment.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      projectId: true,
      legalTeamId: true,
      legalTeam: { select: { name: true } },
      project: {
        select: {
          id: true,
          organizationId: true,
          responsibleUserId: true,
          ...projectAssignmentInclude,
        },
      },
    },
  });
  assertCanEditRecord(currentUser, "Project", assignment.project);

  await prisma.projectTeamAssignment.delete({ where: { id } });

  await writeAuditLog({
    organizationId: currentUser.organizationId,
    entityType: "ProjectTeamAssignment",
    entityId: id,
    action: "DELETE",
    changedById: currentUser.id,
    oldValue: {
      projectId: assignment.projectId,
      legalTeamId: assignment.legalTeamId,
      teamName: assignment.legalTeam.name,
    },
  });

  revalidateProject(assignment.projectId);
}
