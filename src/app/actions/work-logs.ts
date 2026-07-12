"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ApprovalStatus,
  BillingStatus,
  InternalTaskCategory,
} from "@/generated/prisma/enums";
import { setArchived } from "@/lib/archive";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  enumValue,
  optionalNumber,
  optionalString,
  requiredDate,
  requiredNumber,
  requiredString,
} from "@/lib/form";
import {
  assertCanEditRecord,
  canSetBillableStatus,
  canViewRates,
} from "@/lib/permissions";
import { resolveVisibleMatterSelection } from "@/lib/matter-integrity.server";
import { getPrisma } from "@/lib/prisma";

// Internal (non-billable) hours carry an internal category instead of a legal
// area; the form only renders one of the two, so the unused one isn't submitted
// and gets stored as null. Returns null for anything not a valid enum value.
function parseInternalCategory(formData: FormData): InternalTaskCategory | null {
  const raw = formData.get("internalCategory");
  if (
    typeof raw === "string" &&
    (Object.values(InternalTaskCategory) as string[]).includes(raw)
  ) {
    return raw as InternalTaskCategory;
  }
  return null;
}

// Junior roles may only file work as "ke schválení" or "interní" — never
// directly billable. Coerce any other request down to NEEDS_APPROVAL so a
// crafted POST can't bypass the UI restriction.
function resolveBillingStatus(
  user: Parameters<typeof canSetBillableStatus>[0],
  requested: BillingStatus,
): BillingStatus {
  if (canSetBillableStatus(user)) {
    return requested;
  }

  return requested === BillingStatus.INTERNAL_NON_BILLABLE
    ? BillingStatus.INTERNAL_NON_BILLABLE
    : BillingStatus.NEEDS_APPROVAL;
}

type RateInput = {
  caseRate?: number | string | { toString(): string } | null;
  projectRate?: number | string | { toString(): string } | null;
  subjectRate?: number | string | { toString(): string } | null;
};

// Rate priority for billing basis: case > project > subject.
function resolveHourlyRate({ caseRate, projectRate, subjectRate }: RateInput) {
  return Number(caseRate ?? projectRate ?? subjectRate ?? 0);
}

export async function createWorkLog(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const hours = requiredNumber(formData, "hours");
  // Guard against negative/zero or absurd hour counts (a crafted POST could
  // otherwise yield a negative amountCzk). Upper bound 24 = one day's work.
  if (!(hours > 0) || hours > 24) {
    throw new Error("Počet hodin musí být větší než 0 a nejvýše 24.");
  }
  // Only rate-viewers (admin/partner) may override the rate; for everyone else
  // the rate is derived from the case/project/subject and the field is hidden.
  const manualHourlyRate = canViewRates(currentUser)
    ? optionalNumber(formData, "hourlyRate")
    : null;

  const matter = await resolveVisibleMatterSelection(prisma, currentUser, {
    subjectId: optionalString(formData, "subjectId"),
    projectId: optionalString(formData, "projectId"),
    caseId: optionalString(formData, "caseId"),
    taskId: optionalString(formData, "taskId"),
  });
  const { subjectId, projectId, caseId, taskId } = matter;

  const derivedHourlyRate =
    manualHourlyRate ??
    resolveHourlyRate({
      caseRate: matter.caseHourlyRate,
      projectRate: matter.projectHourlyRate,
      subjectRate: matter.subjectHourlyRate,
    });
  const hourlyRate = derivedHourlyRate > 0 ? derivedHourlyRate : null;
  const amountCzk = hourlyRate ? hours * hourlyRate : null;

  const workLog = await prisma.workLog.create({
    data: {
      organizationId: currentUser.organizationId,
      subjectId,
      projectId,
      caseId,
      taskId,
      userId: currentUser.id,
      workDate: requiredDate(formData, "workDate"),
      hours,
      hourlyRate,
      amountCzk,
      description: optionalString(formData, "description"),
      billingStatus: resolveBillingStatus(
        currentUser,
        enumValue(
          BillingStatus,
          formData.get("billingStatus"),
          BillingStatus.BILLABLE,
        ),
      ),
      approvalStatus: enumValue(
        ApprovalStatus,
        formData.get("approvalStatus"),
        ApprovalStatus.DRAFT,
      ),
      legalArea: optionalString(formData, "legalArea"),
      internalCategory: parseInternalCategory(formData),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "WorkLog",
      entityId: workLog.id,
      action: "CREATE",
      changedById: currentUser.id,
      organizationId: currentUser.organizationId,
      newValue: {
        subjectId: workLog.subjectId,
        projectId: workLog.projectId,
        hours: workLog.hours.toString(),
        hourlyRate: workLog.hourlyRate?.toString() ?? null,
        amountCzk: workLog.amountCzk?.toString() ?? null,
        workDate: workLog.workDate.toISOString(),
      },
    },
  });

  revalidatePath("/work-logs");
}

function sameNumber(
  left: number | null,
  right: number | string | { toString(): string } | null,
) {
  if (left === null && right === null) {
    return true;
  }

  if (left === null || right === null) {
    return false;
  }

  return Number(left) === Number(right);
}

export async function updateWorkLog(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const workLogId = requiredString(formData, "id");
  const hours = requiredNumber(formData, "hours");
  // Guard against negative/zero or absurd hour counts (a crafted POST could
  // otherwise yield a negative amountCzk). Upper bound 24 = one day's work.
  if (!(hours > 0) || hours > 24) {
    throw new Error("Počet hodin musí být větší než 0 a nejvýše 24.");
  }
  const manualAmount = optionalNumber(formData, "amountCzk");
  const oldWorkLog = await prisma.workLog.findUniqueOrThrow({
    where: { id: workLogId },
  });
  assertCanEditRecord(currentUser, "WorkLog", oldWorkLog);
  // Výkaz zamčený fakturou (vystavenou nebo rozpracovaným retainerovým draftem)
  // nelze editovat — jinak by se rozešel doklad/RetainerInvoicePeriod se
  // skutečnou prací. Uvolní se stornem/smazáním faktury (invoicedAt → null).
  if (oldWorkLog.invoicedAt) {
    throw new Error(
      "Výkaz je navázán na fakturu — nejprve fakturu stornujte nebo smažte.",
    );
  }

  const matter = await resolveVisibleMatterSelection(prisma, currentUser, {
    subjectId: optionalString(formData, "subjectId"),
    projectId: optionalString(formData, "projectId"),
    caseId: optionalString(formData, "caseId"),
    taskId: optionalString(formData, "taskId"),
  });
  const { subjectId, projectId, caseId, taskId } = matter;

  // Non rate-viewers cannot change the rate — keep the stored value.
  const hourlyRate = canViewRates(currentUser)
    ? optionalNumber(formData, "hourlyRate")
    : oldWorkLog.hourlyRate != null
      ? Number(oldWorkLog.hourlyRate)
      : null;

  const hoursChanged = !sameNumber(hours, oldWorkLog.hours);
  const rateChanged = !sameNumber(hourlyRate, oldWorkLog.hourlyRate);
  // When neither hours nor rate changed, keep the stored amount. Non rate-viewers
  // don't submit amountCzk, so fall back to the existing value rather than
  // silently nulling it during an unrelated edit (e.g. fixing the description).
  const keepAmount = canViewRates(currentUser)
    ? manualAmount
    : oldWorkLog.amountCzk != null
      ? Number(oldWorkLog.amountCzk)
      : null;
  // amountCzk se z formuláře (manualAmount) bere jen pro rate-viewery
  // (ADMIN/PARTNER); junioři nikdy neurčují částku ručně — dostanou dopočet
  // z hodin×sazba, nebo zachování dříve uložené hodnoty.
  const amountCzk =
    hoursChanged || rateChanged
      ? hourlyRate !== null
        ? hours * hourlyRate
        : null
      : keepAmount;

  // Junior roles may switch between their own statuses but must never silently
  // downgrade a partner-approved BILLABLE item just by saving the form.
  const requestedBillingStatus = enumValue(
    BillingStatus,
    formData.get("billingStatus"),
    oldWorkLog.billingStatus,
  );
  const billingStatus = canSetBillableStatus(currentUser)
    ? requestedBillingStatus
    : oldWorkLog.billingStatus === BillingStatus.BILLABLE
      ? BillingStatus.BILLABLE
      : resolveBillingStatus(currentUser, requestedBillingStatus);

  const workLog = await prisma.workLog.update({
    where: { id: workLogId },
    data: {
      subjectId,
      projectId,
      caseId,
      taskId,
      workDate: requiredDate(formData, "workDate"),
      hours,
      hourlyRate,
      amountCzk,
      description: optionalString(formData, "description"),
      billingStatus,
      approvalStatus: enumValue(
        ApprovalStatus,
        formData.get("approvalStatus"),
        ApprovalStatus.DRAFT,
      ),
      legalArea: optionalString(formData, "legalArea"),
      internalCategory: parseInternalCategory(formData),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "WorkLog",
      entityId: workLog.id,
      action: "UPDATE",
      changedById: currentUser.id,
      organizationId: currentUser.organizationId,
      oldValue: auditJson(oldWorkLog),
      newValue: auditJson(workLog),
    },
  });

  revalidatePath("/work-logs");
  redirect("/work-logs");
}

async function setWorkLogArchived(formData: FormData, archived: boolean) {
  const prisma = getPrisma();
  // Zamčený výkaz (navázaný na fakturu/draft) nelze archivovat — bil by se
  // doklad od podkladu. Restore (archived=false) nech projít.
  if (archived) {
    const existing = await prisma.workLog.findUnique({
      where: { id: requiredString(formData, "id") },
      select: { invoicedAt: true },
    });
    if (existing?.invoicedAt) {
      throw new Error(
        "Výkaz je navázán na fakturu — nejprve fakturu stornujte nebo smažte.",
      );
    }
  }
  const workLog = await setArchived(formData, "WorkLog", archived, {
    find: (id) => prisma.workLog.findUniqueOrThrow({ where: { id } }),
    update: (id, data) => prisma.workLog.update({ where: { id }, data }),
  });
  revalidatePath("/work-logs");
  revalidatePath(`/work-logs/${workLog.id}/edit`);
}

export async function archiveWorkLog(formData: FormData) {
  await setWorkLogArchived(formData, true);
}

export async function restoreWorkLog(formData: FormData) {
  await setWorkLogArchived(formData, false);
}
