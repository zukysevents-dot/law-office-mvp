"use server";

import { revalidatePath } from "next/cache";

import { ApprovalStatus, ModuleKey } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import { requiredString } from "@/lib/form";
import { assertCanApproveBilling, canViewRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

async function setApprovalStatus(
  formData: FormData,
  approvalStatus: ApprovalStatus,
  action: string,
) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanApproveBilling(currentUser);

  const workLogId = requiredString(formData, "id");
  const oldWorkLog = await prisma.workLog.findUniqueOrThrow({
    where: { id: workLogId },
  });

  // Defense in depth: also require record-level visibility, matching the
  // per-record assertion every other mutation performs. Today only ADMIN/
  // PARTNER pass assertCanApproveBilling (and they see everything), but this
  // keeps approval safe if the role gate is ever widened.
  if (!canViewRecord(currentUser, "WorkLog", oldWorkLog)) {
    throw new Error("Nemáte oprávnění k tomuto výkazu práce.");
  }

  const workLog = await prisma.workLog.update({
    where: { id: workLogId },
    data: { approvalStatus },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "WorkLog",
      entityId: workLog.id,
      action,
      changedById: currentUser.id,
      oldValue: auditJson(oldWorkLog),
      newValue: auditJson(workLog),
    },
  });

  revalidatePath("/billing");
  revalidatePath("/billing/approvals");
  revalidatePath("/work-logs");
}

export async function approveWorkLog(formData: FormData) {
  await setApprovalStatus(formData, ApprovalStatus.APPROVED, "APPROVE");
}

export async function rejectWorkLog(formData: FormData) {
  await setApprovalStatus(formData, ApprovalStatus.REJECTED, "REJECT");
}
