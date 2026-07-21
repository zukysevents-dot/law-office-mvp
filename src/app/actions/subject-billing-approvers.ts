"use server";

import { revalidatePath } from "next/cache";

import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { assertUserInOrg } from "@/lib/org-users";
import { assertCanManageSubjects } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

function revalidateBillingApprovers(subjectId: string) {
  revalidatePath(`/subjects/${subjectId}`);
  revalidatePath("/work-logs");
  revalidatePath("/billing/approvals");
  revalidatePath("/dashboard");
}

export async function addSubjectBillingApprover(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageSubjects(currentUser);
  const subjectId = requiredString(formData, "subjectId");
  const userId = requiredString(formData, "userId");

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, organizationId: currentUser.organizationId },
    select: { id: true },
  });
  if (!subject) {
    throw new Error("Subjekt nebyl nalezen.");
  }
  await assertUserInOrg(userId, currentUser.organizationId);

  const approver = await prisma.subjectBillingApprover.upsert({
    where: { subjectId_userId: { subjectId, userId } },
    update: {},
    create: {
      organizationId: currentUser.organizationId,
      subjectId,
      userId,
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
      entityType: "SubjectBillingApprover",
      entityId: approver.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: auditJson(approver),
    },
  });
  revalidateBillingApprovers(subjectId);
}

export async function removeSubjectBillingApprover(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageSubjects(currentUser);
  const id = requiredString(formData, "id");
  const approver = await prisma.subjectBillingApprover.findFirst({
    where: { id, organizationId: currentUser.organizationId },
  });
  if (!approver) {
    throw new Error("Schvalovatel nebyl nalezen.");
  }

  await prisma.subjectBillingApprover.delete({ where: { id: approver.id } });
  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
      entityType: "SubjectBillingApprover",
      entityId: approver.id,
      action: "DELETE",
      changedById: currentUser.id,
      oldValue: auditJson(approver),
    },
  });
  revalidateBillingApprovers(approver.subjectId);
}
