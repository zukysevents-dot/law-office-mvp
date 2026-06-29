"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { InvoiceStatus, ModuleKey, VatMode } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { computeInvoiceTotals, computeLine, round2 } from "@/lib/billing-calc";
import { assertModuleEnabled } from "@/lib/entitlements";
import { optionalDate, optionalString, requiredString } from "@/lib/form";
import {
  DEFAULT_VAT_RATE,
  formatInvoiceNumber,
  vatModeForProfile,
} from "@/lib/invoices";
import {
  andWhere,
  assertCanManageInvoices,
  invoiceVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// B-4: build a DRAFT invoice from selected APPROVED, not-yet-invoiced work-logs.
// Lines carry workLogId for traceability; the work-logs are NOT marked invoiced
// here — that happens at issue (so an abandoned draft frees nothing).
export async function createInvoiceFromWorkLogs(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const organizationId = currentUser.organizationId;
  const subjectId = requiredString(formData, "subjectId");
  // Volitelný fakturující subjekt (jinak hlavní profil kanceláře).
  const issuerId = optionalString(formData, "issuerId");
  // Dedupe: a repeated id in the POST must not trip the count check below
  // (Prisma `id: { in }` collapses duplicates, so the raw list could be longer).
  const workLogIds = [
    ...new Set(
      formData
        .getAll("workLogId")
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];

  if (workLogIds.length === 0) {
    throw new Error("Vyberte alespoň jeden výkaz k fakturaci.");
  }

  let invoiceId = "";

  await prisma.$transaction(async (tx) => {
    const subject = await tx.subject.findFirst({
      where: { id: subjectId, organizationId },
    });
    if (!subject) {
      throw new Error("Klient nenalezen.");
    }

    // Only work-logs the user may see (visibility), belonging to THIS client,
    // approved, billable, and not yet invoiced. workLogVisibilityWhere carries
    // the org clause; binding subjectId is the authoritative gate against a
    // direct POST that mixes another client's work-logs onto this invoice.
    const workLogs = await tx.workLog.findMany({
      where: andWhere(workLogVisibilityWhere(currentUser), {
        id: { in: workLogIds },
        subjectId,
        archivedAt: null,
        billingStatus: "BILLABLE",
        approvalStatus: "APPROVED",
        invoicedAt: null,
      }),
      orderBy: { workDate: "asc" },
    });
    // Every selected id must resolve to an invoiceable work-log of this client.
    // A mismatch means some id belongs to another client / isn't billable — fail
    // loudly rather than silently issuing a partial or cross-client invoice.
    if (workLogs.length !== workLogIds.length) {
      throw new Error(
        "Některý z vybraných výkazů nepatří tomuto klientovi nebo jej nelze fakturovat.",
      );
    }

    const profile = await tx.organizationBillingProfile.findUnique({
      where: { organizationId },
    });
    // DPH režim se řídí zvoleným fakturujícím subjektem (nebo profilem kanceláře).
    let issuerVatPayer = profile?.vatPayer ?? false;
    if (issuerId) {
      const issuer = await tx.billingIssuer.findFirst({
        where: { id: issuerId, organizationId, archivedAt: null },
        select: { vatPayer: true },
      });
      if (!issuer) {
        throw new Error("Vybraný fakturující subjekt nenalezen.");
      }
      issuerVatPayer = issuer.vatPayer;
    }
    const vatMode = vatModeForProfile(issuerVatPayer);

    const lineInputs = workLogs.map((wl) => {
      const hours = toNum(wl.hours);
      const amount = toNum(wl.amountCzk);
      const rate =
        wl.hourlyRate != null
          ? toNum(wl.hourlyRate)
          : hours > 0 && wl.amountCzk != null
            ? round2(amount / hours)
            : 0;
      // A work-log with a value but no rate and no hours can't be priced
      // automatically — fail loudly instead of silently invoicing zero.
      if (rate === 0 && amount > 0) {
        throw new Error(
          "Výkaz bez hodinové sazby a s nulovými hodinami nelze automaticky nacenit.",
        );
      }
      return {
        quantity: hours,
        unitPriceCzk: rate,
        vatRate: DEFAULT_VAT_RATE,
        workLogId: wl.id,
        description: wl.description?.trim() || "Právní služby",
      };
    });

    const totals = computeInvoiceTotals(lineInputs, vatMode);

    const created = await tx.invoice.create({
      data: {
        organizationId,
        subjectId,
        status: InvoiceStatus.DRAFT,
        vatMode,
        subtotalCzk: totals.subtotal,
        vatCzk: totals.vat,
        totalCzk: totals.total,
        createdById: currentUser.id,
        issuerId: issuerId || null,
        lines: {
          create: lineInputs.map((li, index) => {
            const r = computeLine(li, vatMode);
            return {
              description: li.description,
              quantity: li.quantity,
              unit: "h",
              unitPriceCzk: li.unitPriceCzk,
              vatRate: vatMode === VatMode.NON_PAYER ? 0 : li.vatRate,
              lineBaseCzk: r.base,
              lineVatCzk: r.vat,
              amountCzk: r.total,
              workLogId: li.workLogId,
              position: index,
            };
          }),
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
          subjectId,
          status: created.status,
          lineCount: lineInputs.length,
          totalCzk: totals.total,
        }),
      },
    });

    invoiceId = created.id;
  });

  revalidatePath("/billing/invoices");
  revalidatePath("/billing");
  redirect(`/billing/invoices/${invoiceId}`);
}

// B-3: issue a DRAFT → ISSUED. Assigns a gap-free number under a FOR UPDATE
// lock on the org+year sequence row, snapshots issuer/customer, recomputes
// totals authoritatively, and marks the source work-logs invoiced — all atomic.
export async function issueInvoice(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const organizationId = currentUser.organizationId;
  const invoiceId = requiredString(formData, "invoiceId");
  const issueDate = optionalDate(formData, "issueDate") ?? new Date();
  const dueDateInput = optionalDate(formData, "dueDate");
  const taxDateInput = optionalDate(formData, "taxDate");
  const variableSymbolInput = optionalString(formData, "variableSymbol");

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: andWhere(invoiceVisibilityWhere(currentUser), { id: invoiceId }),
      include: { lines: true },
    });
    if (!invoice) {
      throw new Error("Faktura nenalezena.");
    }
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new Error("Fakturu lze vystavit pouze z rozpracovaného stavu.");
    }
    if (invoice.lines.length === 0) {
      throw new Error("Faktura nemá žádné položky.");
    }

    const profile = await tx.organizationBillingProfile.findUnique({
      where: { organizationId },
    });
    if (!profile) {
      throw new Error(
        "Nejprve vyplňte fakturační údaje kanceláře (Nastavení → Fakturační údaje).",
      );
    }
    // Resolve the issuer (supplier) for this invoice: a selected additional
    // issuer or the office's main profile. Determines vatMode + the frozen
    // supplier snapshot. vatMode is authoritative — never trust client input;
    // a non-VAT-payer can never issue an invoice with VAT, and vice versa.
    const issuer = {
      legalName: profile.legalName,
      ico: profile.ico,
      dic: profile.dic,
      address: profile.address,
      bankAccount: profile.bankAccount,
      iban: profile.iban,
      vatPayer: profile.vatPayer,
    };
    if (invoice.issuerId) {
      const selected = await tx.billingIssuer.findFirst({
        where: { id: invoice.issuerId, organizationId },
      });
      if (!selected) {
        throw new Error("Vybraný fakturující subjekt nenalezen.");
      }
      issuer.legalName = selected.legalName;
      issuer.ico = selected.ico;
      issuer.dic = selected.dic;
      issuer.address = selected.address;
      issuer.bankAccount = selected.bankAccount;
      issuer.iban = selected.iban;
      issuer.vatPayer = selected.vatPayer;
    }
    const vatMode = vatModeForProfile(issuer.vatPayer);

    const year = issueDate.getUTCFullYear();
    const month = issueDate.getUTCMonth() + 1;

    // Ensure the sequence row exists (race-safe), then lock it so concurrent
    // issues serialize on the same number assignment.
    await tx.$executeRaw`
      INSERT INTO "invoiceNumberSequences" ("id", "organizationId", "year", "prefix", "lastNumber", "createdAt", "updatedAt")
      VALUES (${`seq_${organizationId}_${year}`}, ${organizationId}, ${year}, '', 0, now(), now())
      ON CONFLICT ("organizationId", "year") DO NOTHING`;

    const seqRows = await tx.$queryRaw<
      Array<{ id: string; lastNumber: number; prefix: string }>
    >`SELECT "id", "lastNumber", "prefix" FROM "invoiceNumberSequences"
      WHERE "organizationId" = ${organizationId} AND "year" = ${year} FOR UPDATE`;
    const seq = seqRows[0];
    if (!seq) {
      throw new Error("Nepodařilo se získat číselnou řadu faktur.");
    }

    const nextNumber = Number(seq.lastNumber) + 1;
    // Prefix je nově konfigurovatelný na fakturačním profilu kanceláře; číselná
    // řada (lastNumber) zůstává po ročníku, v čísle se navíc zobrazuje měsíc.
    const number = formatInvoiceNumber(
      profile.invoicePrefix,
      year,
      month,
      nextNumber,
    );

    await tx.invoiceNumberSequence.update({
      where: { id: seq.id },
      data: { lastNumber: nextNumber },
    });

    // Anti double-invoice: every source work-log must still be invoiceable in
    // this org (not invoiced, archived, or moved out of billable/approved since
    // the draft was created). Count-mismatch → abort the whole issue.
    const workLogIds = invoice.lines
      .map((l) => l.workLogId)
      .filter((id): id is string => !!id);
    if (workLogIds.length > 0) {
      const stillValid = await tx.workLog.count({
        where: {
          id: { in: workLogIds },
          organizationId,
          archivedAt: null,
          billingStatus: "BILLABLE",
          approvalStatus: "APPROVED",
          invoicedAt: null,
        },
      });
      if (stillValid !== workLogIds.length) {
        throw new Error(
          "Některý z výkazů už nelze fakturovat (byl mezitím zafakturován, archivován nebo změněn). Vytvořte fakturu znovu.",
        );
      }
    }

    // Authoritative recompute + persist per-line amounts for the issuer's vatMode.
    const lineInputs = invoice.lines.map((l) => ({
      quantity: toNum(l.quantity),
      unitPriceCzk: toNum(l.unitPriceCzk),
      vatRate: toNum(l.vatRate),
    }));
    const totals = computeInvoiceTotals(lineInputs, vatMode);

    for (const line of invoice.lines) {
      const input = {
        quantity: toNum(line.quantity),
        unitPriceCzk: toNum(line.unitPriceCzk),
        vatRate: toNum(line.vatRate),
      };
      const r = computeLine(input, vatMode);
      await tx.invoiceLine.update({
        where: { id: line.id },
        data: {
          vatRate: vatMode === VatMode.NON_PAYER ? 0 : input.vatRate,
          lineBaseCzk: r.base,
          lineVatCzk: r.vat,
          amountCzk: r.total,
        },
      });
    }

    const subject = await tx.subject.findUnique({
      where: { id: invoice.subjectId },
    });

    const dueDate =
      dueDateInput ??
      new Date(issueDate.getTime() + profile.defaultDueDays * MS_PER_DAY);
    const taxDate = taxDateInput ?? issueDate;
    const numberDigits = number.replace(/\D/g, "");
    // CZ variable symbol is max 10 digits — clamp so banks/QR payments accept it.
    const variableSymbol = (variableSymbolInput ?? (numberDigits || number)).slice(
      0,
      10,
    );

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.ISSUED,
        number,
        numberSeq: nextNumber,
        numberYear: year,
        variableSymbol,
        vatMode,
        issueDate,
        dueDate,
        taxDate,
        subtotalCzk: totals.subtotal,
        vatCzk: totals.vat,
        totalCzk: totals.total,
        supplierSnapshot: {
          legalName: issuer.legalName,
          ico: issuer.ico,
          dic: issuer.dic,
          address: issuer.address,
          bankAccount: issuer.bankAccount,
          iban: issuer.iban,
          vatPayer: issuer.vatPayer,
        },
        customerSnapshot: subject
          ? {
              name: subject.name,
              ico: subject.ico,
              dic: subject.dic,
              address: subject.address,
              vatPayer: subject.vatPayer,
            }
          : undefined,
        issuedById: currentUser.id,
      },
    });

    if (workLogIds.length > 0) {
      await tx.workLog.updateMany({
        where: { id: { in: workLogIds }, invoicedAt: null },
        data: { invoicedAt: issueDate, invoicedInvoiceId: invoice.id },
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "Invoice",
        entityId: invoice.id,
        action: "ISSUE",
        changedById: currentUser.id,
        oldValue: auditJson({ status: invoice.status }),
        newValue: auditJson({
          status: updated.status,
          number,
          totalCzk: totals.total,
        }),
      },
    });
  });

  revalidatePath("/billing/invoices");
  revalidatePath(`/billing/invoices/${invoiceId}`);
  revalidatePath("/billing");
}

// Cancel an ISSUED+ invoice: mark CANCELLED (number is NOT recycled — a gap is
// legal) and release its work-logs so they can be re-invoiced.
export async function cancelInvoice(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const invoiceId = requiredString(formData, "invoiceId");
  const reason = optionalString(formData, "cancelReason");

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: andWhere(invoiceVisibilityWhere(currentUser), { id: invoiceId }),
      include: { lines: true },
    });
    if (!invoice) {
      throw new Error("Faktura nenalezena.");
    }
    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new Error("Rozpracovanou fakturu nelze stornovat — smažte ji.");
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new Error("Faktura je již stornovaná.");
    }
    // A (partially) paid invoice must not be plainly cancelled: that would
    // release its work-logs for re-invoicing while the recorded payments stay
    // attached here — opening the door to billing already-paid work twice. The
    // correct correction is a credit note (dobropis).
    if (
      invoice.status === InvoiceStatus.PAID ||
      invoice.status === InvoiceStatus.PARTIALLY_PAID
    ) {
      throw new Error(
        "Uhrazenou ani částečně uhrazenou fakturu nelze stornovat — vystavte opravný daňový doklad (dobropis).",
      );
    }

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    const workLogIds = invoice.lines
      .map((l) => l.workLogId)
      .filter((id): id is string => !!id);
    if (workLogIds.length > 0) {
      await tx.workLog.updateMany({
        where: { id: { in: workLogIds }, invoicedInvoiceId: invoice.id },
        data: { invoicedAt: null, invoicedInvoiceId: null },
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "Invoice",
        entityId: invoice.id,
        action: "CANCEL",
        changedById: currentUser.id,
        oldValue: auditJson({ status: invoice.status }),
        newValue: auditJson({ status: updated.status, reason }),
      },
    });
  });

  revalidatePath("/billing/invoices");
  revalidatePath(`/billing/invoices/${invoiceId}`);
  revalidatePath("/billing");
}

// Delete a DRAFT invoice (cascade removes its lines). ISSUED+ are never deleted.
export async function deleteDraftInvoice(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanManageInvoices(currentUser);

  const invoiceId = requiredString(formData, "invoiceId");

  const invoice = await prisma.invoice.findFirst({
    where: andWhere(invoiceVisibilityWhere(currentUser), { id: invoiceId }),
  });
  if (!invoice) {
    throw new Error("Faktura nenalezena.");
  }
  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new Error("Smazat lze pouze rozpracovanou fakturu.");
  }

  await prisma.invoice.delete({ where: { id: invoiceId } });
  await prisma.auditLog.create({
    data: {
      entityType: "Invoice",
      entityId: invoiceId,
      action: "DELETE",
      changedById: currentUser.id,
      oldValue: auditJson({ status: invoice.status, number: invoice.number }),
    },
  });

  revalidatePath("/billing/invoices");
  redirect("/billing/invoices");
}
