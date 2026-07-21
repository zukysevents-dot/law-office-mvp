"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApprovalStatus, BillingStatus } from "@/generated/prisma/enums";
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
  andWhere,
  assertCanArchiveRecords,
  assertCanEditRecord,
  assertSameOrg,
  canSeeRates,
  canSetBillable,
  caseVisibilityWhere,
  projectVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Non-partner/advokát roles may never mark work directly "Fakturovatelné" —
// clamp such a submission back to "Ke schválení". Enforced server-side so it
// holds even if the form is bypassed.
function resolveBillingStatus(
  user: Parameters<typeof canSetBillable>[0],
  raw: FormDataEntryValue | null,
) {
  const submitted = enumValue(BillingStatus, raw, BillingStatus.NEEDS_APPROVAL);
  if (submitted === BillingStatus.BILLABLE && !canSetBillable(user)) {
    return BillingStatus.NEEDS_APPROVAL;
  }
  return submitted;
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
  const subjectId = optionalString(formData, "subjectId");
  const projectId = optionalString(formData, "projectId");
  const caseId = optionalString(formData, "caseId");
  const taskId = optionalString(formData, "taskId");
  const hours = requiredNumber(formData, "hours");
  // Rate is derived from the matter (case > project > subject); only ADMIN/PARTNER
  // may override it. Juniors never submit or see a rate.
  const manualHourlyRate = canSeeRates(currentUser)
    ? optionalNumber(formData, "hourlyRate")
    : null;

  // Case/project/task lookups are scoped by visibility — a user can't log work
  // against a matter they can't see. subjectId is the shared registry.
  const [legalCase, project, subject, task] = await Promise.all([
    caseId
      ? prisma.case.findFirst({
          where: andWhere({ id: caseId }, caseVisibilityWhere(currentUser)),
          select: { hourlyRate: true },
        })
      : null,
    projectId
      ? prisma.project.findFirst({
          where: andWhere({ id: projectId }, projectVisibilityWhere(currentUser)),
          select: { hourlyRate: true },
        })
      : null,
    subjectId
      ? prisma.subject.findUnique({
          where: { id: subjectId },
          select: { hourlyRate: true },
        })
      : null,
    taskId
      ? prisma.task.findFirst({
          where: andWhere({ id: taskId }, taskVisibilityWhere(currentUser)),
          select: { id: true },
        })
      : null,
  ]);

  if (caseId && !legalCase) {
    throw new Error("Případ nenalezen nebo k němu nemáte oprávnění.");
  }
  if (projectId && !project) {
    throw new Error("Projekt nenalezen nebo k němu nemáte oprávnění.");
  }
  if (taskId && !task) {
    throw new Error("Úkol nenalezen nebo k němu nemáte oprávnění.");
  }

  const derivedHourlyRate =
    manualHourlyRate ??
    resolveHourlyRate({
      caseRate: legalCase?.hourlyRate,
      projectRate: project?.hourlyRate,
      subjectRate: subject?.hourlyRate,
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
        formData.get("billingStatus"),
      ),
      approvalStatus: enumValue(
        ApprovalStatus,
        formData.get("approvalStatus"),
        ApprovalStatus.DRAFT,
      ),
      legalArea: optionalString(formData, "legalArea"),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "WorkLog",
      entityId: workLog.id,
      action: "CREATE",
      changedById: currentUser.id,
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

export async function updateWorkLog(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const workLogId = requiredString(formData, "id");
  const hours = requiredNumber(formData, "hours");

  const oldWorkLog = await prisma.workLog.findUniqueOrThrow({
    where: { id: workLogId },
  });
  assertCanEditRecord(currentUser, "WorkLog", oldWorkLog);

  // Only ADMIN/PARTNER may see or change the rate; for everyone else keep the
  // stored rate untouched.
  const hourlyRate = canSeeRates(currentUser)
    ? optionalNumber(formData, "hourlyRate")
    : oldWorkLog.hourlyRate === null
      ? null
      : Number(oldWorkLog.hourlyRate);

  // Amount is always derived from hours × rate — never taken from the form.
  // (A hidden/absent amount field must not wipe the stored amount, and a junior
  // must not be able to inject an arbitrary billing amount.)
  const amountCzk = hourlyRate !== null ? hours * hourlyRate : null;

  // Only roles allowed to mark work billable may change the billing status;
  // for everyone else keep the stored status (so a junior editing a partner's
  // BILLABLE log can't silently downgrade it to "Ke schválení").
  const billingStatus = canSetBillable(currentUser)
    ? resolveBillingStatus(currentUser, formData.get("billingStatus"))
    : oldWorkLog.billingStatus;

  const workLog = await prisma.workLog.update({
    where: { id: workLogId },
    data: {
      subjectId: optionalString(formData, "subjectId"),
      projectId: optionalString(formData, "projectId"),
      caseId: optionalString(formData, "caseId"),
      taskId: optionalString(formData, "taskId"),
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
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "WorkLog",
      entityId: workLog.id,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: auditJson(oldWorkLog),
      newValue: auditJson(workLog),
    },
  });

  revalidatePath("/work-logs");
  redirect("/work-logs");
}

export async function archiveWorkLog(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanArchiveRecords(currentUser);
  const workLogId = requiredString(formData, "id");
  const oldWorkLog = await prisma.workLog.findUniqueOrThrow({
    where: { id: workLogId },
  });
  assertSameOrg(currentUser, oldWorkLog);
  const workLog = await prisma.workLog.update({
    where: { id: workLogId },
    data: { archivedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "WorkLog",
      entityId: workLog.id,
      action: "ARCHIVE",
      changedById: currentUser.id,
      oldValue: auditJson(oldWorkLog),
      newValue: auditJson(workLog),
    },
  });

  revalidatePath("/work-logs");
  revalidatePath(`/work-logs/${workLog.id}/edit`);
}

export async function restoreWorkLog(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanArchiveRecords(currentUser);
  const workLogId = requiredString(formData, "id");
  const oldWorkLog = await prisma.workLog.findUniqueOrThrow({
    where: { id: workLogId },
  });
  assertSameOrg(currentUser, oldWorkLog);
  const workLog = await prisma.workLog.update({
    where: { id: workLogId },
    data: { archivedAt: null },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "WorkLog",
      entityId: workLog.id,
      action: "RESTORE",
      changedById: currentUser.id,
      oldValue: auditJson(oldWorkLog),
      newValue: auditJson(workLog),
    },
  });

  revalidatePath("/work-logs");
  revalidatePath(`/work-logs/${workLog.id}/edit`);
}
