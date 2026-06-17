"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  checkboxValue,
  enumValue,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/form";
import { defaultNotificationPreferenceData } from "@/lib/notifications/notification-service";
import { assertCanManageUsers } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

function boundedDays(value: number | null, fallback: number) {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return fallback;
  }

  return Math.max(0, Math.min(30, Math.round(value ?? fallback)));
}

export async function createUser(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageUsers(currentUser);

  await prisma.user.create({
    data: {
      name: requiredString(formData, "name"),
      email: requiredString(formData, "email"),
      role: enumValue(UserRole, formData.get("role"), UserRole.LAWYER),
      microsoftId: optionalString(formData, "microsoftId"),
      active: checkboxValue(formData, "active"),
    },
  });

  revalidatePath("/settings");
}

export async function updateNotificationPreference(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const previous = await prisma.notificationPreference.findUnique({
    where: { userId: currentUser.id },
  });
  const data = {
    emailEnabled: checkboxValue(formData, "emailEnabled"),
    taskCreatedEmail: checkboxValue(formData, "taskCreatedEmail"),
    taskStatusChangedEmail: checkboxValue(formData, "taskStatusChangedEmail"),
    taskForReviewEmail: checkboxValue(formData, "taskForReviewEmail"),
    taskDeadlineSoonEmail: checkboxValue(formData, "taskDeadlineSoonEmail"),
    taskFiledFollowupEmail: checkboxValue(formData, "taskFiledFollowupEmail"),
    deadlineReminderDays: boundedDays(
      optionalNumber(formData, "deadlineReminderDays"),
      1,
    ),
    filedFollowupDays: boundedDays(
      optionalNumber(formData, "filedFollowupDays"),
      5,
    ),
  };

  const preference = await prisma.notificationPreference.upsert({
    where: { userId: currentUser.id },
    update: data,
    create: {
      ...defaultNotificationPreferenceData(currentUser.id),
      ...data,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "NotificationPreference",
      entityId: preference.id,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: previous ? auditJson(previous) : undefined,
      newValue: auditJson(preference),
    },
  });

  revalidatePath("/settings");
}
