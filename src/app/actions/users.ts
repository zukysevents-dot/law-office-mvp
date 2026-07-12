"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import {
  Capability,
  OrganizationMemberStatus,
  UserRole,
} from "@/generated/prisma/enums";
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
import { assertUserInOrg } from "@/lib/org-users";
import { hashPassword, verifyPassword } from "@/lib/password";
import { assertCanManageUsers } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { setUserSessionCookie } from "@/lib/session-cookie";

const MIN_PASSWORD_LENGTH = 8;

function boundedDays(value: number | null, fallback: number) {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return fallback;
  }

  return Math.max(0, Math.min(30, Math.round(value ?? fallback)));
}

// Map the per-org unique e-mail violation to a readable Czech message instead
// of a raw Prisma stack trace. Anything else rethrows unchanged.
function rethrowDuplicateEmail(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new Error("Uživatel s tímto e-mailem už existuje.");
  }
  throw error;
}

export async function createUser(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageUsers(currentUser);

  // Bez aktivní kanceláře nemá smysl uživatele zakládat — členství (a tím i
  // celý účet) musí patřit do konkrétní organizace.
  if (!currentUser.organizationId) {
    throw new Error("Nejste členem žádné kanceláře.");
  }
  const organizationId = currentUser.organizationId;

  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`);
  }

  const role = enumValue(UserRole, formData.get("role"), UserRole.LAWYER);
  const passwordHash = await hashPassword(password);

  // Uživatel + jeho členství v kanceláři musí vzniknout atomicky — jinak by
  // selhání druhého kroku zanechalo osiřelý účet bez organizace.
  const created = await prisma
    .$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: requiredString(formData, "name"),
          email: requiredString(formData, "email").trim().toLowerCase(),
          role,
          microsoftId: optionalString(formData, "microsoftId"),
          passwordHash,
          // Accounts provisioned by an authenticated firm administrator are a
          // trusted flow; public self-registration verifies by e-mail instead.
          emailVerifiedAt: new Date(),
          active: checkboxValue(formData, "active"),
        },
      });

      await tx.organizationMember.create({
        data: {
          organizationId,
          userId: user.id,
          role,
          status: OrganizationMemberStatus.ACTIVE,
        },
      });

      return user;
    })
    .catch(rethrowDuplicateEmail);

  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
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

  // userId přichází z FormData — assertCanManageUsers ověřuje jen roli, ne
  // organizaci. Bez tohoto guardu by ADMIN/PARTNER mohl resetovat heslo
  // uživatele z cizí kanceláře.
  await assertUserInOrg(userId, currentUser.organizationId);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      sessionVersion: { increment: 1 },
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
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

  const updated = await prisma.user.update({
    where: { id: currentUser.id },
    data: {
      passwordHash: await hashPassword(next),
      sessionVersion: { increment: 1 },
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
      entityType: "User",
      entityId: currentUser.id,
      action: "PASSWORD_CHANGE",
      changedById: currentUser.id,
    },
  });

  // All other browsers retain the previous version and are rejected by the
  // auth DAL. Keep this browser signed in with a freshly versioned cookie.
  await setUserSessionCookie(updated.id, updated.sessionVersion);

  redirect("/settings");
}

// Kladné hodiny, jinak null. Prázdné pole i zadaná 0 ruší cíl — ukládá se
// jediná reprezentace „bez cíle" (NULL), konzistentně s fulfillmentPercent,
// které cíl <= 0 bere jako nenastavený.
function sanitizeHoursTarget(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

// Admin/partner nastaví týdenní/měsíční plán hodin pracovníka (UserHoursPlan)
// pro „% plnění" na výkazech a týdenní graf na dashboardu.
export async function updateUserHoursPlan(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageUsers(currentUser);

  const userId = requiredString(formData, "userId");

  // userId přichází z FormData — assertCanManageUsers ověřuje jen roli, ne
  // organizaci. Proto explicitně potvrdíme, že cílový uživatel je aktivním
  // členem stejné kanceláře (jinak by ADMIN/PARTNER mohl zapsat plán uživateli
  // jiné kanceláře). Uživatel nemá přímé organizationId — řeší se přes členství.
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId,
      organizationId: currentUser.organizationId,
      status: OrganizationMemberStatus.ACTIVE,
    },
    select: { id: true },
  });
  if (!membership) {
    throw new Error("Uživatel nepatří do vaší kanceláře.");
  }

  const weeklyHoursTarget = sanitizeHoursTarget(
    optionalNumber(formData, "weeklyHoursTarget"),
  );
  const monthlyHoursTarget = sanitizeHoursTarget(
    optionalNumber(formData, "monthlyHoursTarget"),
  );

  const previous = await prisma.userHoursPlan.findUnique({
    where: { userId },
  });

  const plan = await prisma.userHoursPlan.upsert({
    where: { userId },
    update: { weeklyHoursTarget, monthlyHoursTarget },
    create: {
      userId,
      organizationId: currentUser.organizationId ?? null,
      weeklyHoursTarget,
      monthlyHoursTarget,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
      entityType: "UserHoursPlan",
      entityId: plan.id,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: previous ? auditJson(previous) : undefined,
      newValue: auditJson(plan),
    },
  });

  revalidatePath("/settings");
  revalidatePath("/work-logs");
  revalidatePath("/dashboard");
}

const ALL_CAPABILITIES = [Capability.MANAGE_INVOICES, Capability.VIEW_RATES];

// Admin/partner nastaví granulární oprávnění (capability granty) uživatele —
// desired-state save: smaž vše a vytvoř vybrané v jedné transakci (jeden
// společný „uložit", revize ř.4). Allow-only nad rámec role.
export async function setUserCapabilities(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageUsers(currentUser);

  const userId = requiredString(formData, "userId");
  const organizationId = currentUser.organizationId;

  // Cross-org guard: cílový uživatel musí být aktivním členem stejné kanceláře.
  const membership = organizationId
    ? await prisma.organizationMember.findFirst({
        where: {
          userId,
          organizationId,
          status: OrganizationMemberStatus.ACTIVE,
        },
        select: { id: true },
      })
    : null;
  if (!organizationId || !membership) {
    throw new Error("Uživatel nepatří do vaší kanceláře.");
  }

  // Jen platné Capability hodnoty z formuláře (zbytek ignoruj).
  const selected = formData
    .getAll("capabilities")
    .filter((value): value is string => typeof value === "string");
  const capabilities = ALL_CAPABILITIES.filter((capability) =>
    selected.includes(capability),
  );

  const previous = await prisma.userCapabilityGrant.findMany({
    where: { userId },
    select: { capability: true },
  });

  await prisma.$transaction([
    prisma.userCapabilityGrant.deleteMany({ where: { userId } }),
    ...(capabilities.length > 0
      ? [
          prisma.userCapabilityGrant.createMany({
            data: capabilities.map((capability) => ({
              organizationId,
              userId,
              capability,
              grantedById: currentUser.id,
            })),
          }),
        ]
      : []),
  ]);

  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
      entityType: "UserCapabilityGrant",
      entityId: userId,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: previous.map((grant) => grant.capability).sort(),
      newValue: [...capabilities].sort(),
    },
  });

  revalidatePath("/settings");
  revalidatePath("/work-logs");
  revalidatePath("/billing");
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
    deadlineSoonEmail: checkboxValue(formData, "deadlineSoonEmail"),
    deadlineOverdueEmail: checkboxValue(formData, "deadlineOverdueEmail"),
    courtHearingSoonEmail: checkboxValue(formData, "courtHearingSoonEmail"),
    registryChangeEmail: checkboxValue(formData, "registryChangeEmail"),
    deadlineWatchDaysBefore: boundedDays(
      optionalNumber(formData, "deadlineWatchDaysBefore"),
      3,
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
      organizationId: currentUser.organizationId,
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
