"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { InvoiceStatus, ModuleKey, VatMode } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { BILLING_ROW_LIMIT, invoiceableWorkLogWhere } from "@/lib/billing";
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
import {
  computeRetainerSplit,
  formatRetainerPeriod,
  parseRetainerPeriod,
  retainerPeriodBounds,
} from "@/lib/retainer-billing";

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

// B-9: generate a DRAFT invoice for a retainer's monthly fee + hourly overage.
// Hodiny do includedHours kryje paušál (1 řádek), hodiny nad rámec se účtují
// hodinově (řádky přesahu seskupené po sazbě). Kryté i přesahové work-logy se
// zamknou (invoicedAt/invoicedInvoiceId) proti dvojí fakturaci; měsíc je
// idempotentní přes unique RetainerInvoicePeriod. Uživatel pak fakturu vystaví
// běžným flow (gap-free číslo, snapshoty).
export async function generateRetainerInvoice(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const organizationId = currentUser.organizationId;
  const retainerId = requiredString(formData, "retainerId");
  const { year, month } = parseRetainerPeriod(
    optionalString(formData, "period"),
    new Date(),
  );
  const period = formatRetainerPeriod(year, month);
  const { gte, lt } = retainerPeriodBounds(year, month);

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

    // Nelze fakturovat měsíc mimo platnost smlouvy. Inkluzivní hraniční měsíc:
    // měsíc obsahující startDate/endDate se účtuje (lt > startDate a gte < endDate).
    if (lt <= retainer.startDate) {
      throw new Error(`Paušál ${period} je před začátkem platnosti smlouvy.`);
    }
    if (retainer.endDate && gte >= retainer.endDate) {
      throw new Error(`Paušál ${period} je po skončení platnosti smlouvy.`);
    }

    // Idempotence: tvrdá kontrola na RetainerInvoicePeriod (unique měsíc/paušál).
    const existingPeriod = await tx.retainerInvoicePeriod.findUnique({
      where: {
        retainerId_periodYear_periodMonth: {
          retainerId,
          periodYear: year,
          periodMonth: month,
        },
      },
      select: { id: true },
    });
    if (existingPeriod) {
      throw new Error(
        `Faktura za paušál ${period} už existuje — otevřete ji v seznamu faktur.`,
      );
    }

    // Work-logy období ve scope paušálu (subjekt, příp. zúžený na projekt),
    // jen fakturovatelné (BILLABLE + APPROVED + nezafakturované). Už-zamčené
    // hodiny (i jiným paušálem) vypadnou přes invoiceableWorkLogWhere → bez
    // dvojího krytí. Deterministické pořadí určuje, co padne do paušálu.
    const workLogs = await tx.workLog.findMany({
      where: {
        ...invoiceableWorkLogWhere,
        organizationId,
        subjectId: retainer.subjectId,
        ...(retainer.projectId ? { projectId: retainer.projectId } : {}),
        workDate: { gte, lt },
      },
      orderBy: [{ workDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: BILLING_ROW_LIMIT + 1,
      select: {
        id: true,
        hours: true,
        hourlyRate: true,
        case: { select: { hourlyRate: true } },
        project: { select: { hourlyRate: true } },
      },
    });
    if (workLogs.length > BILLING_ROW_LIMIT) {
      throw new Error(
        "Příliš mnoho výkazů za období — rozdělte fakturaci nebo kontaktujte podporu.",
      );
    }

    const includedHours =
      retainer.includedHours != null ? Number(retainer.includedHours) : null;
    const split = computeRetainerSplit(
      includedHours,
      workLogs.map((workLog) => ({
        id: workLog.id,
        hours: Number(workLog.hours),
      })),
    );

    const profile = await tx.organizationBillingProfile.findUnique({
      where: { organizationId },
    });
    const vatMode = vatModeForProfile(profile?.vatPayer);
    const vatRate = vatMode === VatMode.NON_PAYER ? 0 : Number(retainer.vatRate);

    // Sazba přesahu per work-log: výkaz → případ → projekt; chybí-li, fail loud.
    const overageSet = new Set(split.overageIds);
    const overageByRate = new Map<number, number>();
    for (const workLog of workLogs) {
      if (!overageSet.has(workLog.id)) {
        continue;
      }
      const rate =
        workLog.hourlyRate != null
          ? Number(workLog.hourlyRate)
          : workLog.case?.hourlyRate != null
            ? Number(workLog.case.hourlyRate)
            : workLog.project?.hourlyRate != null
              ? Number(workLog.project.hourlyRate)
              : null;
      if (rate == null || !Number.isFinite(rate) || rate <= 0) {
        throw new Error(
          "U přesahových hodin chybí hodinová sazba — doplňte sazbu u projektu/případu nebo výkazu a zkuste to znovu.",
        );
      }
      overageByRate.set(
        rate,
        round2((overageByRate.get(rate) ?? 0) + Number(workLog.hours)),
      );
    }

    // Řádky: paušál (pozice 0) + přesah po sazbách (pozice 1..N).
    const lineInputs = [
      { quantity: 1, unitPriceCzk: Number(retainer.monthlyFeeCzk), vatRate },
    ];
    const flatLine = computeLine(lineInputs[0], vatMode);
    const lineCreates = [
      {
        description: `Paušální odměna – ${period}`,
        quantity: 1,
        unit: "měsíc",
        unitPriceCzk: lineInputs[0].unitPriceCzk,
        vatRate,
        lineBaseCzk: flatLine.base,
        lineVatCzk: flatLine.vat,
        amountCzk: flatLine.total,
        position: 0,
      },
    ];
    let position = 1;
    for (const [rate, hours] of [...overageByRate.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      const input = { quantity: hours, unitPriceCzk: rate, vatRate };
      const overageLine = computeLine(input, vatMode);
      lineInputs.push(input);
      lineCreates.push({
        description: `Právní služby nad rámec paušálu (přesah) – ${period}`,
        quantity: hours,
        unit: "h",
        unitPriceCzk: rate,
        vatRate,
        lineBaseCzk: overageLine.base,
        lineVatCzk: overageLine.vat,
        amountCzk: overageLine.total,
        position: position++,
      });
    }

    const totals = computeInvoiceTotals(lineInputs, vatMode);

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
        lines: { create: lineCreates },
      },
    });

    // Tvrdá idempotence období (P2002 = souběžná generace téhož měsíce).
    try {
      await tx.retainerInvoicePeriod.create({
        data: {
          organizationId,
          retainerId,
          invoiceId: created.id,
          periodYear: year,
          periodMonth: month,
          coveredHours: split.coveredHours,
          overageHours: split.overageHours,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new Error(`Faktura za paušál ${period} už existuje.`);
      }
      throw error;
    }

    // Zamkni kryté i přesahové work-logy proti dvojí fakturaci. invoicedAt se
    // tu nastavuje už u DRAFTu (na rozdíl od běžné faktury) — paušální měsíc je
    // tím „rezervovaný"; storno/smazání faktury lock uvolní.
    const lockedIds = [...split.coveredIds, ...split.overageIds];
    if (lockedIds.length > 0) {
      await tx.workLog.updateMany({
        where: { id: { in: lockedIds }, invoicedAt: null },
        data: { invoicedAt: new Date(), invoicedInvoiceId: created.id },
      });
    }

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
          coveredHours: split.coveredHours,
          overageHours: split.overageHours,
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
