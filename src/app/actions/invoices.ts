"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { InvoiceStatus } from "@/generated/prisma/enums";
import { auditJson, writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  billingFilterWhere,
  invoiceableWorkLogWhere,
} from "@/lib/billing";
import { optionalString, requiredString } from "@/lib/form";
import {
  computeInvoiceTotals,
  formatInvoiceNumber,
} from "@/lib/invoice";
import {
  andWhere,
  assertCanApproveBilling,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

function isUniqueViolation(error: unknown) {
  return (error as { code?: string })?.code === "P2002";
}

// Turns the currently invoiceable work logs for one subject (and optional date
// range) into a real, numbered invoice. Reuses the billing basis filter so the
// document can never include a log that isn't billable+approved, and stamps
// invoiceId on each so it can't be billed twice.
export async function createInvoiceFromWorkLogs(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanApproveBilling(currentUser);

  const subjectId = requiredString(formData, "subjectId");
  const dateFrom = optionalString(formData, "dateFrom") ?? "";
  const dateTo = optionalString(formData, "dateTo") ?? "";

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: currentUser.organizationId },
  });
  if (!org.ico || !org.bankAccount) {
    throw new Error(
      "Doplňte údaje kanceláře (IČO a bankovní účet) v Nastavení → Kancelář, než vystavíte fakturu.",
    );
  }

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, organizationId: currentUser.organizationId },
    select: { id: true },
  });
  if (!subject) {
    throw new Error("Subjekt nebyl nalezen.");
  }

  const logs = await prisma.workLog.findMany({
    where: andWhere(
      invoiceableWorkLogWhere,
      workLogVisibilityWhere(currentUser),
      billingFilterWhere({
        subjectId,
        projectId: "",
        caseId: "",
        userId: "",
        dateFrom,
        dateTo,
      }),
    ),
    orderBy: [{ workDate: "asc" }],
    include: { case: { select: { name: true, fileNumber: true } } },
  });
  if (logs.length === 0) {
    throw new Error(
      "Pro tento subjekt a období nejsou žádné nevyfakturované podklady.",
    );
  }

  const lineItems = logs.map((log) => {
    const quantity = Number(log.hours ?? 0);
    const unitPrice = Number(log.hourlyRate ?? 0);
    const amount = Number(log.amountCzk ?? quantity * unitPrice);
    const matter = log.case
      ? `${log.case.name}${log.case.fileNumber ? `, ${log.case.fileNumber}` : ""}`
      : log.legalArea ?? "Právní služby";
    return {
      workLogId: log.id,
      description: log.description?.trim() || matter,
      quantity,
      unitPrice,
      amountCzk: amount,
    };
  });
  const subtotal = lineItems.reduce((sum, item) => sum + item.amountCzk, 0);
  const totals = computeInvoiceTotals(subtotal, org.vatPayer, org.vatRate);
  const logIds = logs.map((log) => log.id);
  const year = new Date().getUTCFullYear();
  const dueAt = new Date(Date.now() + org.invoiceDueDays * 86_400_000);

  // ponytail: next number = max(seq)+1 per org/year, guarded by the unique
  // constraint with a small retry — a per-org counter table only if issuing
  // ever becomes concurrent enough to lose the race repeatedly.
  let invoiceId = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const agg = await prisma.invoice.aggregate({
      where: { organizationId: currentUser.organizationId, year },
      _max: { seq: true },
    });
    const seq = (agg._max.seq ?? 0) + 1;
    const invoiceNumber = formatInvoiceNumber(year, seq);
    try {
      invoiceId = await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            organizationId: currentUser.organizationId,
            invoiceNumber,
            year,
            seq,
            subjectId,
            dueAt,
            subtotalCzk: totals.subtotal,
            vatCzk: totals.vat,
            totalCzk: totals.total,
            vatRate: org.vatPayer ? org.vatRate : 0,
            note: org.vatPayer ? null : "Nejsme plátci DPH.",
            createdById: currentUser.id,
            lineItems: { create: lineItems },
          },
        });
        // Only claim logs still unbilled — protects against a concurrent
        // invoice grabbing the same logs.
        await tx.workLog.updateMany({
          where: { id: { in: logIds }, invoiceId: null },
          data: { invoiceId: invoice.id },
        });
        return invoice.id;
      });
      break;
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }

  await writeAuditLog({
    entityType: "Invoice",
    entityId: invoiceId,
    action: "CREATE",
    changedById: currentUser.id,
    newValue: auditJson({ subjectId, subtotal: totals.subtotal, total: totals.total, lines: logIds.length }),
  });

  revalidatePath("/invoices");
  revalidatePath("/billing");
  revalidatePath("/work-logs");
  redirect(`/invoices/${invoiceId}`);
}

export async function markInvoicePaid(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanApproveBilling(currentUser);

  const invoiceId = requiredString(formData, "id");
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });
  if (invoice.organizationId !== currentUser.organizationId) {
    throw new Error("Faktura patří jiné kanceláři.");
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: InvoiceStatus.PAID, paidAt: new Date() },
  });

  await writeAuditLog({
    entityType: "Invoice",
    entityId: invoiceId,
    action: "PAY",
    changedById: currentUser.id,
    oldValue: auditJson({ status: invoice.status }),
    newValue: auditJson({ status: updated.status, paidAt: updated.paidAt }),
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
}

// F3: record that a payment reminder was sent for an overdue invoice. The
// actual e-mail to the client is user-initiated (mailto in the UI) — we never
// auto-send on the user's behalf. This only stamps the reminder + audit.
export async function sendInvoiceReminder(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanApproveBilling(currentUser);

  const invoiceId = requiredString(formData, "id");
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });
  if (invoice.organizationId !== currentUser.organizationId) {
    throw new Error("Faktura patří jiné kanceláři.");
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { lastReminderAt: new Date() },
  });

  await writeAuditLog({
    entityType: "Invoice",
    entityId: invoiceId,
    action: "REMIND",
    changedById: currentUser.id,
    newValue: auditJson({ invoiceNumber: invoice.invoiceNumber }),
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
}
