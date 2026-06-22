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
  caseVisibilityWhere,
  projectVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

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
  const manualHourlyRate = optionalNumber(formData, "hourlyRate");

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
      billingStatus: enumValue(
        BillingStatus,
        formData.get("billingStatus"),
        BillingStatus.BILLABLE,
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
  const hourlyRate = optionalNumber(formData, "hourlyRate");
  const manualAmount = optionalNumber(formData, "amountCzk");

  const oldWorkLog = await prisma.workLog.findUniqueOrThrow({
    where: { id: workLogId },
  });
  assertCanEditRecord(currentUser, "WorkLog", oldWorkLog);

  const hoursChanged = !sameNumber(hours, oldWorkLog.hours);
  const rateChanged = !sameNumber(hourlyRate, oldWorkLog.hourlyRate);
  const amountCzk =
    hoursChanged || rateChanged
      ? hourlyRate !== null
        ? hours * hourlyRate
        : null
      : manualAmount;

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
      billingStatus: enumValue(
        BillingStatus,
        formData.get("billingStatus"),
        BillingStatus.BILLABLE,
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
