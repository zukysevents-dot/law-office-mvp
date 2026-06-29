"use server";

import { revalidatePath } from "next/cache";

import {
  ApprovalStatus,
  BillingStatus,
  ModuleKey,
} from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
} from "@/lib/form";
import { assertCanApproveBilling, canViewRecord } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

type Disposition = "APPROVE" | "REJECT" | "HIDDEN_WRITE_OFF" | "VISIBLE_WRITE_OFF";

const DISPOSITIONS: Disposition[] = [
  "APPROVE",
  "REJECT",
  "HIDDEN_WRITE_OFF",
  "VISIBLE_WRITE_OFF",
];

// Schvalování výkazu do fakturačních podkladů. Kromě rozhodnutí umožňuje partneru
// upravit popis, pracovníka, hodiny i sazbu (částka se přepočítá). Rozhodnutí:
//  - APPROVE          → fakturovatelné + schváleno (jde do faktury)
//  - REJECT           → zamítnuto (vypadne z podkladů)
//  - HIDDEN_WRITE_OFF → skrytý odpis: do archivu, mimo fakturu i výkaz klienta
//  - VISIBLE_WRITE_OFF→ viditelný odpis: 0 Kč, na výkazu klienta, mimo fakturu
export async function decideWorkLog(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanApproveBilling(currentUser);

  const workLogId = requiredString(formData, "id");
  const disposition = requiredString(formData, "disposition") as Disposition;
  if (!DISPOSITIONS.includes(disposition)) {
    throw new Error("Neplatné rozhodnutí.");
  }

  const oldWorkLog = await prisma.workLog.findUniqueOrThrow({
    where: { id: workLogId },
  });
  // Defense in depth — also require record-level visibility.
  if (!canViewRecord(currentUser, "WorkLog", oldWorkLog)) {
    throw new Error("Nemáte oprávnění k tomuto výkazu práce.");
  }

  const hours = requiredNumber(formData, "hours");
  const hourlyRate = optionalNumber(formData, "hourlyRate");
  const description = optionalString(formData, "description");
  const userId = optionalString(formData, "userId");

  // Reassigned worker must be an existing active user (dropdown is org-scoped).
  if (userId && userId !== oldWorkLog.userId) {
    const user = await prisma.user.findFirst({
      where: { id: userId, active: true },
      select: { id: true },
    });
    if (!user) {
      throw new Error("Vybraný pracovník neexistuje nebo je deaktivovaný.");
    }
  }

  const baseAmount = hourlyRate != null ? hours * hourlyRate : null;

  let billingStatus = oldWorkLog.billingStatus;
  let approvalStatus = oldWorkLog.approvalStatus;
  let amountCzk: number | null = baseAmount;
  let archivedAt: Date | null = oldWorkLog.archivedAt;

  switch (disposition) {
    case "APPROVE":
      billingStatus = BillingStatus.BILLABLE;
      approvalStatus = ApprovalStatus.APPROVED;
      archivedAt = null;
      break;
    case "REJECT":
      approvalStatus = ApprovalStatus.REJECTED;
      break;
    case "HIDDEN_WRITE_OFF":
      billingStatus = BillingStatus.HIDDEN_WRITE_OFF;
      approvalStatus = ApprovalStatus.APPROVED;
      archivedAt = oldWorkLog.archivedAt ?? new Date();
      break;
    case "VISIBLE_WRITE_OFF":
      billingStatus = BillingStatus.VISIBLE_WRITE_OFF;
      approvalStatus = ApprovalStatus.APPROVED;
      amountCzk = 0;
      archivedAt = null;
      break;
  }

  const workLog = await prisma.workLog.update({
    where: { id: workLogId },
    data: {
      hours,
      hourlyRate: hourlyRate ?? null,
      amountCzk,
      description,
      ...(userId ? { userId } : {}),
      billingStatus,
      approvalStatus,
      archivedAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "WorkLog",
      entityId: workLog.id,
      action: `BILLING_${disposition}`,
      changedById: currentUser.id,
      oldValue: auditJson(oldWorkLog),
      newValue: auditJson(workLog),
    },
  });

  revalidatePath("/billing");
  revalidatePath("/billing/approvals");
  revalidatePath("/work-logs");
}
