"use server";

import { revalidatePath } from "next/cache";

import { InvoiceStatus, ModuleKey, PaymentMethod } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { round2 } from "@/lib/billing-calc";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  enumValue,
  optionalDate,
  optionalString,
  requiredNumber,
  requiredString,
} from "@/lib/form";
import { resolvePaidStatus } from "@/lib/invoices";
import {
  andWhere,
  assertCanManageInvoices,
  invoiceVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// B-7: record a payment against an issued invoice and recompute its status from
// the SUM of all payments (PARTIALLY_PAID / PAID). Done in one transaction so
// the payment row and the derived status can't diverge.
export async function recordPayment(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const invoiceId = requiredString(formData, "invoiceId");
  const amount = round2(requiredNumber(formData, "amountCzk"));
  const paidAt = optionalDate(formData, "paidAt") ?? new Date();
  const method = enumValue(
    PaymentMethod,
    formData.get("method"),
    PaymentMethod.BANK_TRANSFER,
  );
  const note = optionalString(formData, "note");

  if (!Number.isFinite(amount) || amount <= 0 || amount > 9_999_999.99) {
    throw new Error("Neplatná částka úhrady.");
  }

  await prisma.$transaction(async (tx) => {
    // Lock the invoice row so concurrent payments serialize — otherwise both
    // could read the same stale sum and leave the status stuck in
    // PARTIALLY_PAID after the invoice is actually fully covered. Scope to the
    // user's org so we never take a lock on another tenant's row.
    await tx.$queryRaw`SELECT id FROM "invoices" WHERE id = ${invoiceId} AND "organizationId" = ${currentUser.organizationId} FOR UPDATE`;

    const invoice = await tx.invoice.findFirst({
      where: andWhere(invoiceVisibilityWhere(currentUser), { id: invoiceId }),
      include: { payments: true },
    });
    if (!invoice) {
      throw new Error("Faktura nenalezena.");
    }
    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new Error("Úhradu lze evidovat až u vystavené faktury.");
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new Error("Stornovanou fakturu nelze hradit.");
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new Error("Faktura je již plně uhrazena.");
    }

    await tx.payment.create({
      data: {
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        paidAt,
        amountCzk: amount,
        method,
        note,
        recordedById: currentUser.id,
      },
    });

    const paidTotal = round2(
      invoice.payments.reduce((sum, p) => sum + toNum(p.amountCzk), 0) + amount,
    );
    const nextStatus = resolvePaidStatus(toNum(invoice.totalCzk), paidTotal);

    if (nextStatus !== invoice.status) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: nextStatus },
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "Invoice",
        entityId: invoice.id,
        action: "PAYMENT",
        changedById: currentUser.id,
        oldValue: auditJson({ status: invoice.status }),
        newValue: auditJson({
          status: nextStatus,
          amountCzk: amount,
          paidTotal,
        }),
      },
    });
  });

  revalidatePath("/billing/invoices");
  revalidatePath(`/billing/invoices/${invoiceId}`);
}
