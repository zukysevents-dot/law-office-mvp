"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { InvoiceStatus, ModuleKey, VatMode } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { computeInvoiceTotals, computeLine, round2 } from "@/lib/billing-calc";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  optionalDate,
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
} from "@/lib/form";
import { vatModeForProfile } from "@/lib/invoices";
import { assertCanManageInvoices } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

const DEFAULT_VAT_RATE = 21;

// Create a retainer agreement (recurring monthly fee for a subject).
export async function createRetainer(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const organizationId = currentUser.organizationId;
  const subjectId = requiredString(formData, "subjectId");
  const monthlyFeeCzk = round2(requiredNumber(formData, "monthlyFeeCzk"));
  const includedHours = optionalNumber(formData, "includedHours");
  const vatRate = optionalNumber(formData, "vatRate") ?? DEFAULT_VAT_RATE;
  const startDate = optionalDate(formData, "startDate") ?? new Date();
  const endDate = optionalDate(formData, "endDate");
  const note = optionalString(formData, "note");

  if (
    !Number.isFinite(monthlyFeeCzk) ||
    monthlyFeeCzk <= 0 ||
    monthlyFeeCzk > 9_999_999.99
  ) {
    throw new Error("Neplatná výše měsíčního paušálu.");
  }
  if (vatRate < 0 || vatRate > 100) {
    throw new Error("Neplatná sazba DPH.");
  }
  if (includedHours != null && includedHours < 0) {
    throw new Error("Počet hodin v ceně nemůže být záporný.");
  }

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, organizationId },
  });
  if (!subject) {
    throw new Error("Klient nenalezen.");
  }

  const created = await prisma.retainerAgreement.create({
    data: {
      organizationId,
      subjectId,
      monthlyFeeCzk,
      includedHours,
      vatRate,
      startDate,
      endDate,
      note,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "RetainerAgreement",
      entityId: created.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: auditJson({ subjectId, monthlyFeeCzk }),
    },
  });

  revalidatePath("/billing/retainers");
}

// Archive (deactivate) a retainer — stops it generating further invoices.
export async function archiveRetainer(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const retainerId = requiredString(formData, "retainerId");
  const retainer = await prisma.retainerAgreement.findFirst({
    where: { id: retainerId, organizationId: currentUser.organizationId },
  });
  if (!retainer) {
    throw new Error("Paušál nenalezen.");
  }

  await prisma.retainerAgreement.update({
    where: { id: retainer.id },
    data: { active: false, archivedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      entityType: "RetainerAgreement",
      entityId: retainer.id,
      action: "ARCHIVE",
      changedById: currentUser.id,
    },
  });

  revalidatePath("/billing/retainers");
}

// B-9: generate a DRAFT invoice for a retainer's monthly fee. The user then
// issues it through the normal flow (gap-free number, snapshots, etc.).
export async function generateRetainerInvoice(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const organizationId = currentUser.organizationId;
  const retainerId = requiredString(formData, "retainerId");
  // Period label like "06/2026"; defaults to the current month.
  const periodInput = optionalString(formData, "period");
  const now = new Date();
  const period =
    periodInput && /^\d{4}-\d{2}$/.test(periodInput)
      ? `${periodInput.slice(5, 7)}/${periodInput.slice(0, 4)}`
      : `${String(now.getUTCMonth() + 1).padStart(2, "0")}/${now.getUTCFullYear()}`;

  let invoiceId = "";

  await prisma.$transaction(async (tx) => {
    const retainer = await tx.retainerAgreement.findFirst({
      where: { id: retainerId, organizationId },
    });
    if (!retainer) {
      throw new Error("Paušál nenalezen.");
    }
    if (!retainer.active) {
      throw new Error("Z neaktivního paušálu nelze generovat fakturu.");
    }
    // Guard against a retainer pointing at another org's project (data integrity).
    if (retainer.projectId) {
      const project = await tx.project.findFirst({
        where: { id: retainer.projectId, organizationId },
      });
      if (!project) {
        throw new Error("Projekt paušálu nepatří této kanceláři.");
      }
    }

    const profile = await tx.organizationBillingProfile.findUnique({
      where: { organizationId },
    });
    const vatMode = vatModeForProfile(profile?.vatPayer);
    const vatRate = vatMode === VatMode.NON_PAYER ? 0 : Number(retainer.vatRate);

    const lineInput = {
      quantity: 1,
      unitPriceCzk: Number(retainer.monthlyFeeCzk),
      vatRate,
    };
    const line = computeLine(lineInput, vatMode);
    const totals = computeInvoiceTotals([lineInput], vatMode);

    const created = await tx.invoice.create({
      data: {
        organizationId,
        subjectId: retainer.subjectId,
        projectId: retainer.projectId,
        status: InvoiceStatus.DRAFT,
        vatMode,
        subtotalCzk: totals.subtotal,
        vatCzk: totals.vat,
        totalCzk: totals.total,
        createdById: currentUser.id,
        note: `Paušál ${period}`,
        lines: {
          create: [
            {
              description: `Paušální odměna – ${period}`,
              quantity: 1,
              unit: "měsíc",
              unitPriceCzk: lineInput.unitPriceCzk,
              vatRate,
              lineBaseCzk: line.base,
              lineVatCzk: line.vat,
              amountCzk: line.total,
              position: 0,
            },
          ],
        },
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Invoice",
        entityId: created.id,
        action: "CREATE",
        changedById: currentUser.id,
        newValue: auditJson({
          status: created.status,
          retainerId: retainer.id,
          period,
          totalCzk: totals.total,
        }),
      },
    });

    invoiceId = created.id;
  });

  revalidatePath("/billing/invoices");
  revalidatePath("/billing/retainers");
  redirect(`/billing/invoices/${invoiceId}`);
}
