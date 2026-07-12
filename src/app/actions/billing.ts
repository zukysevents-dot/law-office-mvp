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
import { assertUserInOrg } from "@/lib/org-users";
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

  const hours = requiredNumber(formData, "hours");
  if (!(hours > 0) || hours > 24) {
    throw new Error("Počet hodin musí být větší než 0 a nejvýše 24.");
  }
  const hourlyRateRaw = optionalString(formData, "hourlyRate");
  const hourlyRate = optionalNumber(formData, "hourlyRate");
  if (hourlyRateRaw !== null && hourlyRate === null) {
    throw new Error("Neplatná hodinová sazba.");
  }
  if (hourlyRate !== null && (hourlyRate < 0 || hourlyRate > 9_999_999.99)) {
    throw new Error("Hodinová sazba musí být nezáporná a v povoleném rozsahu.");
  }
  const description = optionalString(formData, "description");
  const userId = optionalString(formData, "userId");

  // Form options are org-scoped, but the action is a public mutation endpoint:
  // enforce the same tenant + active-account invariant server-side.
  await assertUserInOrg(userId, currentUser.organizationId);

  await prisma.$transaction(async (tx) => {
    // Serialize billing decisions with invoice issuance. Once invoicedAt is set,
    // this action must not mutate the source data behind an immutable invoice.
    await tx.$queryRaw`SELECT id FROM "workLogs" WHERE id = ${workLogId} AND "organizationId" = ${currentUser.organizationId} FOR UPDATE`;

    const oldWorkLog = await tx.workLog.findFirst({
      where: { id: workLogId, organizationId: currentUser.organizationId },
    });
    if (!oldWorkLog || !canViewRecord(currentUser, "WorkLog", oldWorkLog)) {
      throw new Error("Nemáte oprávnění k tomuto výkazu práce.");
    }
    if (oldWorkLog.invoicedAt) {
      throw new Error(
        "Výkaz je navázán na fakturu — nejprve fakturu stornujte nebo smažte.",
      );
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

    const workLog = await tx.workLog.update({
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

    await tx.auditLog.create({
      data: {
        entityType: "WorkLog",
        entityId: workLog.id,
        action: `BILLING_${disposition}`,
        changedById: currentUser.id,
        organizationId: currentUser.organizationId,
        oldValue: auditJson(oldWorkLog),
        newValue: auditJson(workLog),
      },
    });
  });

  revalidatePath("/billing");
  revalidatePath("/billing/approvals");
  revalidatePath("/work-logs");
}
