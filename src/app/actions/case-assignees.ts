"use server";

import { revalidatePath } from "next/cache";

import { caseAssignmentInclude, parseAssigneeToken } from "@/lib/assignments";
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

function revalidateCase(caseId: string, projectId: string) {
  const paths = assignmentRevalidationPaths([
    { kind: "case", id: caseId, name: "", organizationId: "", projectId },
  ]);
  for (const path of paths) {
    revalidatePath(path);
  }
}

// Přidání řešitele případu z detailu: osoba ("user:<id>") nebo celý tým
// ("team:<id>"). Stejný gate jako editace případu. Přiřazení dostanou
// notifikaci.
export async function addCaseAssignment(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.cases");
  const caseId = requiredString(formData, "caseId");
  const token = parseAssigneeToken(formData.get("assignee"));
  if (!token) {
    throw new Error("Vyberte tým nebo osobu.");
  }

  const matter = await loadEditableMatter(prisma, currentUser, "case", caseId);
  const assignee = await resolveAssignee(prisma, currentUser, token);
  await assignToMatters(prisma, currentUser, [matter], assignee);

  revalidateCase(caseId, matter.projectId ?? "");
}

// Starší tvar formuláře (pole `userId`) — deleguje na addCaseAssignment.
export async function addCaseAssignee(formData: FormData) {
  const userId = requiredString(formData, "userId");
  formData.set("assignee", `user:${userId}`);
  await addCaseAssignment(formData);
}

export async function removeCaseAssignee(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.cases");
  const id = requiredString(formData, "id");

  const assignee = await prisma.caseAssignee.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      caseId: true,
      userId: true,
      case: {
        select: {
          id: true,
          projectId: true,
          organizationId: true,
          responsibleUserId: true,
          ...caseAssignmentInclude,
        },
      },
    },
  });
  assertCanEditRecord(currentUser, "Case", assignee.case);

  await prisma.caseAssignee.delete({ where: { id } });

  await writeAuditLog({
    organizationId: currentUser.organizationId,
    entityType: "CaseAssignee",
    entityId: id,
    action: "DELETE",
    changedById: currentUser.id,
    oldValue: { caseId: assignee.caseId, userId: assignee.userId },
  });

  revalidateCase(assignee.caseId, assignee.case.projectId);
}

// Odebrání týmu z řešitelů případu.
export async function removeCaseTeamAssignment(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.cases");
  const id = requiredString(formData, "id");

  const assignment = await prisma.caseTeamAssignment.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      caseId: true,
      legalTeamId: true,
      legalTeam: { select: { name: true } },
      case: {
        select: {
          id: true,
          projectId: true,
          organizationId: true,
          responsibleUserId: true,
          ...caseAssignmentInclude,
        },
      },
    },
  });
  assertCanEditRecord(currentUser, "Case", assignment.case);

  await prisma.caseTeamAssignment.delete({ where: { id } });

  await writeAuditLog({
    organizationId: currentUser.organizationId,
    entityType: "CaseTeamAssignment",
    entityId: id,
    action: "DELETE",
    changedById: currentUser.id,
    oldValue: {
      caseId: assignment.caseId,
      legalTeamId: assignment.legalTeamId,
      teamName: assignment.legalTeam.name,
    },
  });

  revalidateCase(assignment.caseId, assignment.case.projectId);
}
