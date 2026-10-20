"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import {
  Capability,
  OrganizationMemberStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { auditJson, writeAuditLog } from "@/lib/audit";
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
import {
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "@/lib/password";
import { assertCanManageUsers } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { normalizeCalendarView } from "@/lib/calendar-view";
import { setUserSessionCookie } from "@/lib/session-cookie";
import {
  invitationResultMessage,
  type InvitationMessage,
} from "@/lib/user-invitation-messages";
import {
  issueAndSendUserInvitation,
  type InvitationResult,
} from "@/lib/user-invitations";

function boundedDays(value: number | null, fallback: number) {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return fallback;
  }

  return Math.max(0, Math.min(30, Math.round(value ?? fallback)));
}

function isDuplicateEmailError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export type CreateUserState = {
  ok: boolean;
  /** Changes on every submit so the client can re-show the banner. */
  submittedAt?: number;
  tone?: InvitationMessage["tone"];
  message?: string;
  error?: string;
  /** Echo of the submitted fields on a validation error (never the password),
   * so the form doesn't lose what the admin typed. */
  values?: {
    name: string;
    email: string;
    role: string;
    microsoftId: string;
    active: boolean;
  };
};

// Admin/partner creates a member of their office. The user + membership are
// created atomically; then (for an active user) the welcome invitation with a
// one-time "set your own password" link is e-mailed immediately. If SMTP is
// not configured or sending fails, the user still exists and the returned
// message tells the admin why and to hand over the credentials personally.
export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageUsers(currentUser);

  // Bez aktivní kanceláře nemá smysl uživatele zakládat — členství (a tím i
  // celý účet) musí patřit do konkrétní organizace.
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = enumValue(UserRole, formData.get("role"), UserRole.LAWYER);
  const active = checkboxValue(formData, "active");
  const fail = (error: string): CreateUserState => ({
    ok: false,
    submittedAt: Date.now(),
    error,
    values: {
      name,
      email,
      role,
      microsoftId: String(formData.get("microsoftId") ?? ""),
      active,
    },
  });

  if (!currentUser.organizationId) {
    return fail("Nejste členem žádné kanceláře.");
  }
  const organizationId = currentUser.organizationId;

  if (!name) {
    return fail("Vyplňte jméno uživatele.");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Zadejte platný e-mail.");
  }

  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`);
  }

  const passwordHash = await hashPassword(password);

  // Uživatel + jeho členství v kanceláři musí vzniknout atomicky — jinak by
  // selhání druhého kroku zanechalo osiřelý účet bez organizace.
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          role,
          microsoftId: optionalString(formData, "microsoftId"),
          passwordHash,
          // Accounts provisioned by an authenticated firm administrator are a
          // trusted flow; public self-registration verifies by e-mail instead.
          emailVerifiedAt: new Date(),
          active,
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
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return fail("Uživatel s tímto e-mailem už existuje.");
    }
    throw error;
  }

  await writeAuditLog({
    organizationId,
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
  });

  const invitation: InvitationResult = created.active
    ? await issueAndSendUserInvitation({
        userId: created.id,
        organizationId,
        actor: { id: currentUser.id, name: currentUser.name },
      })
    : { status: "INACTIVE" };
  const result = invitationResultMessage(
    invitation,
    { name: created.name, email: created.email },
    "create",
  );

  revalidatePath("/settings");
  return {
    ok: true,
    submittedAt: Date.now(),
    tone: result.tone,
    message: result.message,
  };
}

export type ResendInvitationState = {
  ok: boolean;
  submittedAt?: number;
  tone?: InvitationMessage["tone"];
  message?: string;
};

// "Znovu poslat pozvánku" on a row of the users table (admin/partner only,
// own office only). Refused within 60 s of the previous invitation.
export async function resendUserInvitation(
  _prev: ResendInvitationState,
  formData: FormData,
): Promise<ResendInvitationState> {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  assertCanManageUsers(currentUser);

  if (!currentUser.organizationId) {
    return {
      ok: false,
      submittedAt: Date.now(),
      tone: "error",
      message: "Nejste členem žádné kanceláře.",
    };
  }
  const userId = requiredString(formData, "userId");
  if (userId === currentUser.id) {
    // UI tlačítko u vlastního řádku zakazuje; tady totéž hlídá server.
    return {
      ok: false,
      submittedAt: Date.now(),
      tone: "error",
      message: "Pozvánku nelze poslat sám sobě.",
    };
  }
  // userId přichází z FormData — bez tohoto guardu by šlo poslat pozvánku
  // uživateli z cizí kanceláře.
  await assertUserInOrg(userId, currentUser.organizationId);

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  if (!target) {
    return {
      ok: false,
      submittedAt: Date.now(),
      tone: "error",
      message: "Uživatel nebyl nalezen.",
    };
  }

  const invitation = await issueAndSendUserInvitation({
    userId,
    organizationId: currentUser.organizationId,
    actor: { id: currentUser.id, name: currentUser.name },
    dedupe: true,
  });
  const result = invitationResultMessage(invitation, target, "resend");

  revalidatePath("/settings");
  return {
    ok: invitation.status === "SENT",
    submittedAt: Date.now(),
    tone: result.tone,
    message: result.message,
  };
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

export async function updateCalendarPreference(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const previous = await prisma.notificationPreference.findUnique({
    where: { userId: currentUser.id },
  });
  const calendarDefaultView = normalizeCalendarView(
    formData.get("calendarDefaultView"),
  );

  const preference = await prisma.notificationPreference.upsert({
    where: { userId: currentUser.id },
    update: { calendarDefaultView },
    create: {
      ...defaultNotificationPreferenceData(currentUser.id),
      calendarDefaultView,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
      entityType: "NotificationPreference",
      entityId: preference.id,
      action: "UPDATE_CALENDAR_VIEW",
      changedById: currentUser.id,
      oldValue: previous ? auditJson(previous) : undefined,
      newValue: auditJson(preference),
    },
  });

  revalidatePath("/settings");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}
