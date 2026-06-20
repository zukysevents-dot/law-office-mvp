"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

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
import { hashPassword, verifyPassword } from "@/lib/password";
import { assertCanManageUsers } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

const MIN_PASSWORD_LENGTH = 8;

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

  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`);
  }

  const created = await prisma.user.create({
    data: {
      name: requiredString(formData, "name"),
      email: requiredString(formData, "email").trim().toLowerCase(),
      role: enumValue(UserRole, formData.get("role"), UserRole.LAWYER),
      microsoftId: optionalString(formData, "microsoftId"),
      passwordHash: await hashPassword(password),
      active: checkboxValue(formData, "active"),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "User",
      entityId: created.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: {
        name: created.name,
        email: created.email,
        role: created.role,
        active: created.active,
      },
    },
  });

  revalidatePath("/settings");
}

// Admin/partner resets another user's password (e.g. forgotten password).
export async function setUserPassword(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageUsers(currentUser);

  const userId = requiredString(formData, "userId");
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "User",
      entityId: userId,
      action: "PASSWORD_RESET",
      changedById: currentUser.id,
    },
  });

  revalidatePath("/settings");
}

// Any signed-in user changes their own password (must prove the current one).
export async function changeOwnPassword(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Nové heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`);
  }
  if (!(await verifyPassword(current, currentUser.passwordHash))) {
    throw new Error("Stávající heslo není správné.");
  }

  await prisma.user.update({
    where: { id: currentUser.id },
    data: { passwordHash: await hashPassword(next) },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "User",
      entityId: currentUser.id,
      action: "PASSWORD_CHANGE",
      changedById: currentUser.id,
    },
  });

  redirect("/settings");
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
