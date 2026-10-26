"use server";

import { revalidatePath } from "next/cache";

import { ModuleKey } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  APPROVAL_DISPOSITIONS,
  ApprovalSelectionError,
  applyApprovalDecision,
  approvalScopeWhere,
  approverDecisionWhere,
  BULK_DISPOSITIONS,
  bulkDecisionMessage,
  STALE_SELECTION_MESSAGE,
  parseBulkWorkLogIds,
  type ApprovalDisposition,
  type BulkDecisionState,
} from "@/lib/billing-approvals";
import { getApprovalAccess } from "@/lib/billing-approvals.server";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
} from "@/lib/form";
import { assertUserInOrg } from "@/lib/org-users";
import { andWhere, canViewRates } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

function revalidateApprovalSurfaces() {
  revalidatePath("/billing");
  revalidatePath("/billing/approvals");
  revalidatePath("/work-logs");
  revalidatePath("/work-logs/approvals");
  revalidatePath("/dashboard");
}

// Schvalování výkazu do fakturačních podkladů. Kromě rozhodnutí umožňuje
// schvalovateli upravit popis, pracovníka, hodiny i sazbu (částka se
// přepočítá). Rozhodnutí viz applyApprovalDecision (src/lib/billing-approvals.ts).
// Oprávnění: ADMIN/PARTNER celá kancelář, jinak jen klienti, u kterých je
// uživatel fakturačním schvalovatelem — stejná pravidla jako hromadná akce.
export async function decideWorkLog(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  // Jen modul kanceláře (entitlement), ne sekce Fakturace v matici: o schválení
  // rozhoduje funkce „Schvaluje výkazy celé kanceláře“ NEBO přiřazení schvalovatelem u klienta
  // (SubjectBillingApprover — kterýkoli člen, i koncipient), viz níže.
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);

  const workLogId = requiredString(formData, "id");
  const disposition = requiredString(
    formData,
    "disposition",
  ) as ApprovalDisposition;
  if (!APPROVAL_DISPOSITIONS.includes(disposition)) {
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

  const access = await getApprovalAccess(prisma, currentUser);
  const decisionWhere = approverDecisionWhere(currentUser, access);
  if (!decisionWhere) {
    throw new Error("Nemáte oprávnění k tomuto výkazu práce.");
  }

  await prisma.$transaction(async (tx) => {
    // Serialize billing decisions with invoice issuance. Once invoicedAt is set,
    // this action must not mutate the source data behind an immutable invoice.
    await tx.$queryRaw`SELECT id FROM "workLogs" WHERE id = ${workLogId} AND "organizationId" = ${currentUser.organizationId} FOR UPDATE`;

    const oldWorkLog = await tx.workLog.findFirst({
      where: andWhere({ id: workLogId }, decisionWhere),
    });
    if (!oldWorkLog) {
      throw new Error("Nemáte oprávnění k tomuto výkazu práce.");
    }
    if (oldWorkLog.invoicedAt) {
      throw new Error(
        "Výkaz je navázán na fakturu — nejprve fakturu stornujte nebo smažte.",
      );
    }

    // Schvalovatel bez „Vidí sazby a částky“ (např. koncipient určený u
    // klienta) sazbu nevidí ani nemění — platí uložená.
    const rate = canViewRates(currentUser)
      ? hourlyRate
      : oldWorkLog.hourlyRate != null
        ? Number(oldWorkLog.hourlyRate)
        : null;

    const workLog = await tx.workLog.update({
      where: { id: workLogId },
      data: applyApprovalDecision(oldWorkLog, disposition, {
        hours,
        hourlyRate: rate,
        description,
        userId,
      }),
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

  revalidateApprovalSurfaces();
}

class StaleSelectionError extends Error {}

// Hromadné schválení / zamítnutí vybraných položek fronty (useActionState).
// All-or-nothing: every selected ID must still be pending, not invoiced and in
// the user's approver scope, otherwise nothing changes. Stored hours, rate and
// description are kept (unsaved card edits are not part of a bulk decision).
// One audit entry per item (newValue.bulk = true).
export async function bulkDecideWorkLogs(
  _previous: BulkDecisionState,
  formData: FormData,
): Promise<BulkDecisionState> {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);

  const access = await getApprovalAccess(prisma, currentUser);
  if (!access.canApprove) {
    return {
      status: "error",
      message: "Nemáte oprávnění schvalovat fakturační podklady.",
      at: Date.now(),
    };
  }

  const disposition = formData.get("disposition") as ApprovalDisposition;
  if (!BULK_DISPOSITIONS.includes(disposition)) {
    return { status: "error", message: "Neplatné rozhodnutí.", at: Date.now() };
  }

  let ids: string[];
  try {
    ids = parseBulkWorkLogIds(formData);
  } catch (error) {
    if (error instanceof ApprovalSelectionError) {
      return { status: "error", message: error.message, at: Date.now() };
    }
    throw error;
  }

  const organizationId = currentUser.organizationId;
  let decided = 0;
  try {
    await prisma.$transaction(
      async (tx) => {
        // Same serialization with invoice issuance as decideWorkLog; ORDER BY
        // keeps the lock order stable between concurrent bulk requests.
        await tx.$queryRaw`SELECT id FROM "workLogs" WHERE id = ANY(${ids}::text[]) AND "organizationId" = ${organizationId} ORDER BY id FOR UPDATE`;

        // Org + pending + approver scope + not invoiced, all in one query.
        const olds = await tx.workLog.findMany({
          where: andWhere(
            approvalScopeWhere(currentUser, access),
            { id: { in: ids } },
            { invoicedAt: null },
          ),
          orderBy: { id: "asc" },
        });
        if (olds.length !== ids.length) {
          throw new StaleSelectionError();
        }

        const updated = [];
        for (const old of olds) {
          updated.push(
            await tx.workLog.update({
              where: { id: old.id },
              data: applyApprovalDecision(old, disposition),
            }),
          );
        }

        await tx.auditLog.createMany({
          data: updated.map((workLog, index) => ({
            entityType: "WorkLog",
            entityId: workLog.id,
            action: `BILLING_${disposition}`,
            changedById: currentUser.id,
            organizationId,
            oldValue: auditJson(olds[index]),
            newValue: auditJson({ ...workLog, bulk: true }),
          })),
        });
        decided = updated.length;
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (error instanceof StaleSelectionError) {
      return {
        status: "error",
        message: STALE_SELECTION_MESSAGE,
        at: Date.now(),
      };
    }
    throw error;
  }

  revalidateApprovalSurfaces();
  return {
    status: "ok",
    decided,
    message: bulkDecisionMessage(disposition, decided),
    at: Date.now(),
  };
}
