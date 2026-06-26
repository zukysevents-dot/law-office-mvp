"use server";

import { revalidatePath } from "next/cache";

import { InvoiceStatus, ModuleKey, ReminderLevel } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import { enumValue, optionalString, requiredString } from "@/lib/form";
import {
  andWhere,
  assertCanManageInvoices,
  invoiceVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// B-8: record a dunning reminder against an unpaid issued invoice. This is the
// legal evidence trail (1st notice / reminder / pre-litigation demand). Actual
// e-mail delivery to the client is a later integration (the internal mailer
// only targets org users); the channel is stored for when it lands.
export async function sendReminder(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const invoiceId = requiredString(formData, "invoiceId");
  const level = enumValue(
    ReminderLevel,
    formData.get("level"),
    ReminderLevel.FIRST,
  );
  const note = optionalString(formData, "note");

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: andWhere(invoiceVisibilityWhere(currentUser), { id: invoiceId }),
    });
    if (!invoice) {
      throw new Error("Faktura nenalezena.");
    }
    if (
      invoice.status === InvoiceStatus.DRAFT ||
      invoice.status === InvoiceStatus.CANCELLED ||
      invoice.status === InvoiceStatus.PAID
    ) {
      throw new Error("Upomínku lze zaslat jen u nezaplacené vystavené faktury.");
    }

    await tx.reminder.create({
      data: {
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        level,
        channel: "EMAIL",
        sentById: currentUser.id,
        note,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "Invoice",
        entityId: invoice.id,
        action: "REMINDER",
        changedById: currentUser.id,
        newValue: auditJson({ level, channel: "EMAIL" }),
      },
    });
  });

  revalidatePath(`/billing/invoices/${invoiceId}`);
}

// Mark an issued invoice as sent to the client (ISSUED → SENT).
export async function markInvoiceSent(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const invoiceId = requiredString(formData, "invoiceId");

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: andWhere(invoiceVisibilityWhere(currentUser), { id: invoiceId }),
    });
    if (!invoice) {
      throw new Error("Faktura nenalezena.");
    }
    if (invoice.status !== InvoiceStatus.ISSUED) {
      throw new Error("Jako odeslanou lze označit jen vystavenou fakturu.");
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.SENT },
    });
    await tx.auditLog.create({
      data: {
        entityType: "Invoice",
        entityId: invoice.id,
        action: "MARK_SENT",
        changedById: currentUser.id,
        oldValue: auditJson({ status: invoice.status }),
        newValue: auditJson({ status: InvoiceStatus.SENT }),
      },
    });
  });

  revalidatePath("/billing/invoices");
  revalidatePath(`/billing/invoices/${invoiceId}`);
}
