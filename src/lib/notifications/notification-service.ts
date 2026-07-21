import nodemailer, { type Transporter } from "nodemailer";

import {
  NotificationStatus,
  NotificationType,
  TaskStatus,
} from "@/generated/prisma/enums";
import { taskStatusLabels } from "@/lib/labels";
import { getPrisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 3;
const DEFAULT_DEADLINE_REMINDER_DAYS = 1;
const DEFAULT_FILED_FOLLOWUP_DAYS = 5;
const DEFAULT_SEND_LIMIT = 50;
const LOCK_TIMEOUT_MINUTES = 15;

type NotificationPreferenceShape = {
  emailEnabled: boolean;
  taskCreatedEmail: boolean;
  taskStatusChangedEmail: boolean;
  taskForReviewEmail: boolean;
  taskDeadlineSoonEmail: boolean;
  taskFiledFollowupEmail: boolean;
  deadlineReminderDays: number;
  filedFollowupDays: number;
};

export type NotificationPayload = {
  toUserId?: string | null;
  toUserIds?: Array<string | null | undefined>;
  actorUserId?: string | null;
  type?: NotificationType;
  subject: string;
  body: string;
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
};

export type NotificationRunResult = {
  created: number;
  sent: number;
  failed: number;
  skipped: number;
};

let smtpTransporter: Transporter | null = null;

const defaultPreference: NotificationPreferenceShape = {
  emailEnabled: true,
  taskCreatedEmail: true,
  taskStatusChangedEmail: true,
  taskForReviewEmail: true,
  taskDeadlineSoonEmail: true,
  taskFiledFollowupEmail: true,
  deadlineReminderDays: DEFAULT_DEADLINE_REMINDER_DAYS,
  filedFollowupDays: DEFAULT_FILED_FOLLOWUP_DAYS,
};

function notificationPreferenceData() {
  return defaultPreference;
}

function uniqueRecipients(
  ids: Array<string | null | undefined>,
  actorUserId?: string | null,
) {
  const recipients = new Set<string>();

  for (const id of ids) {
    if (id && id !== actorUserId) {
      recipients.add(id);
    }
  }

  return [...recipients];
}

function preferenceAllows(
  preference: NotificationPreferenceShape | null | undefined,
  type: NotificationType,
) {
  const current = preference ?? defaultPreference;

  if (!current.emailEnabled) {
    return false;
  }

  if (type === NotificationType.TASK_CREATED) {
    return current.taskCreatedEmail;
  }

  if (type === NotificationType.TASK_STATUS_CHANGED) {
    return current.taskStatusChangedEmail;
  }

  if (type === NotificationType.TASK_FOR_REVIEW) {
    return current.taskForReviewEmail;
  }

  if (
    type === NotificationType.TASK_DEADLINE_SOON ||
    type === NotificationType.TASK_DEADLINE_ESCALATED
  ) {
    return current.taskDeadlineSoonEmail;
  }

  if (type === NotificationType.TASK_FILED_FOLLOWUP) {
    return current.taskFiledFollowupEmail;
  }

  // Invoice reminders are operational, not per-task; only the master switch gates them.
  if (type === NotificationType.INVOICE_OVERDUE) {
    return current.emailEnabled;
  }

  return false;
}

function envFlag(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function envNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function appUrl(path: string) {
  const baseUrl = process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3001";
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function emailHtml(body: string) {
  return body
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\n", "<br />");
}

function getSmtpTransporter() {
  if (!envFlag(process.env.EMAIL_NOTIFICATIONS_ENABLED)) {
    return null;
  }

  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();

  if (!host || !from) {
    return null;
  }

  if (!smtpTransporter) {
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASSWORD?.trim();

    smtpTransporter = nodemailer.createTransport({
      host,
      port: envNumber(process.env.SMTP_PORT, 587),
      secure: envFlag(process.env.SMTP_SECURE),
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  return smtpTransporter;
}

function disabledReason() {
  if (!envFlag(process.env.EMAIL_NOTIFICATIONS_ENABLED)) {
    return "EMAIL_NOTIFICATIONS_DISABLED";
  }

  if (!process.env.SMTP_HOST?.trim()) {
    return "SMTP_HOST_NOT_CONFIGURED";
  }

  if (!process.env.SMTP_FROM?.trim()) {
    return "SMTP_FROM_NOT_CONFIGURED";
  }

  return "SMTP_NOT_CONFIGURED";
}

function formatTaskNotificationBody({
  title,
  message,
  taskId,
}: {
  title: string;
  message: string;
  taskId: string;
}) {
  return [
    message,
    "",
    `Úkol: ${title}`,
    `Odkaz: ${appUrl(`/tasks/${taskId}`)}`,
  ].join("\n");
}

function normalizeDays(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(30, Math.round(value)));
}

function truncateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

function lockCutoff(now: Date) {
  const cutoff = new Date(now);
  cutoff.setMinutes(cutoff.getMinutes() - LOCK_TIMEOUT_MINUTES);

  return cutoff;
}

export function defaultNotificationPreferenceData(userId: string) {
  return {
    userId,
    ...notificationPreferenceData(),
  };
}

export async function getNotificationPreference(userId: string) {
  const prisma = getPrisma();

  return prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: defaultNotificationPreferenceData(userId),
  });
}

export async function queueInternalNotification(payload: NotificationPayload) {
  const type = payload.type ?? NotificationType.TASK_CREATED;
  const recipientIds = uniqueRecipients(
    [...(payload.toUserIds ?? []), payload.toUserId],
    payload.actorUserId,
  );

  if (recipientIds.length === 0) {
    return { queued: 0, skipped: 0 };
  }

  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { id: { in: recipientIds } },
    select: {
      id: true,
      email: true,
      active: true,
      notificationPreference: true,
    },
  });
  let queued = 0;
  let skipped = 0;

  for (const user of users) {
    const allowed = user.active && preferenceAllows(user.notificationPreference, type);
    const status = allowed
      ? NotificationStatus.PENDING
      : NotificationStatus.SKIPPED;
    const dedupeKey = payload.dedupeKey
      ? `${payload.dedupeKey}:${user.id}`
      : undefined;
    const data = {
      recipientUserId: user.id,
      type,
      status,
      subject: payload.subject,
      body: payload.body,
      entityType: payload.entityType,
      entityId: payload.entityId,
      dedupeKey,
      emailTo: user.email,
      lastError: allowed ? undefined : "NOTIFICATION_PREFERENCE_DISABLED",
    };

    if (dedupeKey) {
      const notification = await prisma.notification.upsert({
        where: { dedupeKey },
        update: {},
        create: data,
      });

      if (notification.createdAt.getTime() === notification.updatedAt.getTime()) {
        if (notification.status === NotificationStatus.PENDING) {
          queued += 1;
        } else if (notification.status === NotificationStatus.SKIPPED) {
          skipped += 1;
        }
      }
    } else {
      await prisma.notification.create({ data });

      if (status === NotificationStatus.PENDING) {
        queued += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return { queued, skipped };
}

export async function queueTaskCreatedNotifications({
  task,
  actorUserId,
}: {
  task: {
    id: string;
    title: string;
    shortDescription: string | null;
    assignedToId: string | null;
    responsibleUserId: string | null;
  };
  actorUserId: string;
}) {
  return queueInternalNotification({
    toUserIds: [task.assignedToId, task.responsibleUserId],
    actorUserId,
    type: NotificationType.TASK_CREATED,
    subject: `Nový úkol: ${task.title}`,
    body: formatTaskNotificationBody({
      title: task.title,
      message: task.shortDescription || "Byl vám přiřazen nový úkol.",
      taskId: task.id,
    }),
    entityType: "Task",
    entityId: task.id,
  });
}

export async function queueTaskStatusNotifications({
  task,
  oldStatus,
  newStatus,
  actorUserId,
}: {
  task: {
    id: string;
    title: string;
    createdById: string | null;
    assignedToId: string | null;
    responsibleUserId: string | null;
  };
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  actorUserId: string;
}) {
  await queueInternalNotification({
    toUserIds: [task.assignedToId, task.responsibleUserId, task.createdById],
    actorUserId,
    type: NotificationType.TASK_STATUS_CHANGED,
    subject: `Změna statusu úkolu: ${task.title}`,
    body: formatTaskNotificationBody({
      title: task.title,
      message: `Status se změnil z "${taskStatusLabels[oldStatus]}" na "${taskStatusLabels[newStatus]}".`,
      taskId: task.id,
    }),
    entityType: "Task",
    entityId: task.id,
  });

  if (newStatus === TaskStatus.FOR_REVIEW) {
    await queueInternalNotification({
      toUserIds: [task.responsibleUserId ?? task.createdById],
      type: NotificationType.TASK_FOR_REVIEW,
      subject: `Úkol ke kontrole: ${task.title}`,
      body: formatTaskNotificationBody({
        title: task.title,
        message: "Úkol byl předán ke kontrole.",
        taskId: task.id,
      }),
      entityType: "Task",
      entityId: task.id,
    });
  }
}

export async function sendPendingNotifications(limit = DEFAULT_SEND_LIMIT) {
  const prisma = getPrisma();
  const transporter = getSmtpTransporter();
  const now = new Date();
  const staleLock = lockCutoff(now);
  const unlockedOrStale = [
    { lockedAt: null },
    { lockedAt: { lt: staleLock } },
  ];
  const notifications = await prisma.notification.findMany({
    where: {
      status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] },
      attempts: { lt: MAX_ATTEMPTS },
      OR: unlockedOrStale,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      recipient: {
        select: {
          id: true,
          email: true,
          active: true,
          notificationPreference: true,
        },
      },
    },
  });
  const result = { sent: 0, failed: 0, skipped: 0 };

  if (!transporter) {
    for (const notification of notifications) {
      const update = await prisma.notification.updateMany({
        where: {
          id: notification.id,
          status: notification.status,
          attempts: notification.attempts,
          OR: unlockedOrStale,
        },
        data: {
          status: NotificationStatus.FAILED,
          lockedAt: null,
          lastError: disabledReason(),
        },
      });

      if (update.count === 1) {
        result.failed += 1;
      }
    }

    return result;
  }

  for (const notification of notifications) {
    const claim = await prisma.notification.updateMany({
      where: {
        id: notification.id,
        status: notification.status,
        attempts: notification.attempts,
        OR: unlockedOrStale,
      },
      data: { lockedAt: now },
    });

    if (claim.count !== 1) {
      continue;
    }

    const allowed =
      notification.recipient.active &&
      preferenceAllows(notification.recipient.notificationPreference, notification.type);

    if (!allowed) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SKIPPED,
          lockedAt: null,
          lastError: "NOTIFICATION_PREFERENCE_DISABLED",
        },
      });
      result.skipped += 1;
      continue;
    }

    if (!notification.recipient.email) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SKIPPED,
          lockedAt: null,
          lastError: "RECIPIENT_EMAIL_MISSING",
        },
      });
      result.skipped += 1;
      continue;
    }

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: notification.recipient.email,
        subject: notification.subject,
        text: notification.body,
        html: emailHtml(notification.body),
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          attempts: { increment: 1 },
          emailTo: notification.recipient.email,
          lockedAt: null,
          lastError: null,
        },
      });
      result.sent += 1;
    } catch (error) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          attempts: { increment: 1 },
          emailTo: notification.recipient.email,
          lockedAt: null,
          lastError: truncateError(error),
        },
      });
      result.failed += 1;
    }
  }

  return result;
}

async function preferenceForUser(
  userId: string,
  cache: Map<string, NotificationPreferenceShape>,
) {
  const cached = cache.get(userId);

  if (cached) {
    return cached;
  }

  const preference = await getNotificationPreference(userId);
  cache.set(userId, preference);

  return preference;
}

// Days-before-deadline stages for the escalating reminder ladder (F1). Procedural
// deadlines get all stages; internal deadlines keep the single legacy reminder.
const PROCEDURAL_DEADLINE_STAGES = [7, 3, 1] as const;
// Below this many days-to-deadline, an unacknowledged procedural deadline
// escalates to the responsible lawyer.
const DEADLINE_ESCALATION_DAYS = 3;

// For each recipient, also notify their active stand-in (F1 zastupitelnost).
async function expandWithSubstitutes(
  ids: string[],
  now: Date,
  cache: Map<string, string | null>,
): Promise<string[]> {
  const prisma = getPrisma();
  const out = new Set(ids);
  for (const id of ids) {
    let sub = cache.get(id);
    if (sub === undefined) {
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          substituteUserId: true,
          substituteFrom: true,
          substituteUntil: true,
        },
      });
      const active =
        user?.substituteUserId &&
        (!user.substituteFrom || user.substituteFrom <= now) &&
        (!user.substituteUntil || user.substituteUntil >= now);
      sub = active ? user!.substituteUserId : null;
      cache.set(id, sub);
    }
    if (sub) out.add(sub);
  }
  return [...out];
}

async function createScheduledDeadlineNotifications(now: Date) {
  const prisma = getPrisma();
  const maxWindow = new Date(now);
  maxWindow.setDate(maxWindow.getDate() + 30);

  const tasks = await prisma.task.findMany({
    where: {
      archivedAt: null,
      status: { not: TaskStatus.COMPLETED },
      deadline: { gte: now, lte: maxWindow },
    },
    select: {
      id: true,
      title: true,
      deadline: true,
      deadlineType: true,
      deadlineAckedAt: true,
      assignedToId: true,
      responsibleUserId: true,
    },
  });
  const preferenceCache = new Map<string, NotificationPreferenceShape>();
  const substituteCache = new Map<string, string | null>();
  let created = 0;

  const daysUntil = (deadline: Date) =>
    Math.floor((deadline.getTime() - now.getTime()) / 86_400_000);

  for (const task of tasks) {
    if (!task.deadline) continue;
    const remaining = daysUntil(task.deadline);
    const baseRecipients = uniqueRecipients([
      task.assignedToId,
      task.responsibleUserId,
    ]);
    const recipientIds = await expandWithSubstitutes(
      baseRecipients,
      now,
      substituteCache,
    );

    // Which reminder stages fire: procedural → escalating ladder, internal →
    // the single per-user reminder from their preference (legacy behaviour).
    const stages =
      task.deadlineType === "PROCEDURAL"
        ? PROCEDURAL_DEADLINE_STAGES.filter((s) => remaining <= s)
        : [];

    for (const recipientId of recipientIds) {
      const preference = await preferenceForUser(recipientId, preferenceCache);

      if (task.deadlineType === "PROCEDURAL") {
        // Fire the latest (smallest days-before) stage that has been reached.
        const stage = stages[stages.length - 1];
        if (stage === undefined) continue;
        const result = await queueInternalNotification({
          toUserId: recipientId,
          type: NotificationType.TASK_DEADLINE_SOON,
          subject: `Blíží se procesní lhůta (T-${stage}): ${task.title}`,
          body: formatTaskNotificationBody({
            title: task.title,
            message: `Procesní lhůta ${task.deadline.toLocaleDateString("cs-CZ")} — zbývá ${remaining} dní. Potvrďte převzetí lhůty v úkolu.`,
            taskId: task.id,
          }),
          entityType: "Task",
          entityId: task.id,
          dedupeKey: `task:${task.id}:deadline:${stage}`,
        });
        created += result.queued + result.skipped;
        continue;
      }

      // Internal deadline — single reminder honouring the user's lead time.
      const reminderAt = new Date(task.deadline);
      reminderAt.setDate(
        reminderAt.getDate() -
          normalizeDays(
            preference.deadlineReminderDays,
            DEFAULT_DEADLINE_REMINDER_DAYS,
          ),
      );
      if (now < reminderAt) continue;
      const result = await queueInternalNotification({
        toUserId: recipientId,
        type: NotificationType.TASK_DEADLINE_SOON,
        subject: `Blíží se deadline: ${task.title}`,
        body: formatTaskNotificationBody({
          title: task.title,
          message: `Blíží se deadline úkolu: ${task.deadline.toLocaleDateString("cs-CZ")}.`,
          taskId: task.id,
        }),
        entityType: "Task",
        entityId: task.id,
        dedupeKey: `task:${task.id}:deadline-soon`,
      });
      created += result.queued + result.skipped;
    }

    // Escalation: a procedural deadline close and NOT acknowledged → alert the
    // responsible lawyer explicitly (once), so nobody assumes someone else has it.
    if (
      task.deadlineType === "PROCEDURAL" &&
      !task.deadlineAckedAt &&
      remaining <= DEADLINE_ESCALATION_DAYS &&
      task.responsibleUserId
    ) {
      const result = await queueInternalNotification({
        toUserId: task.responsibleUserId,
        type: NotificationType.TASK_DEADLINE_ESCALATED,
        subject: `Nepotvrzená procesní lhůta: ${task.title}`,
        body: formatTaskNotificationBody({
          title: task.title,
          message: `Procesní lhůta ${task.deadline.toLocaleDateString("cs-CZ")} (zbývá ${remaining} dní) nebyla nikým převzata. Zkontrolujte prosím zajištění úkonu.`,
          taskId: task.id,
        }),
        entityType: "Task",
        entityId: task.id,
        dedupeKey: `task:${task.id}:escalated`,
      });
      created += result.queued + result.skipped;
    }
  }

  return created;
}

async function createScheduledInvoiceOverdueNotifications(now: Date) {
  const prisma = getPrisma();
  const invoices = await prisma.invoice.findMany({
    where: {
      status: "ISSUED",
      dueAt: { lt: now },
    },
    select: {
      id: true,
      invoiceNumber: true,
      dueAt: true,
      totalCzk: true,
      createdById: true,
    },
  });
  // One reminder per invoice per day, deduped so a daily cron doesn't spam.
  const day = now.toISOString().slice(0, 10);
  let created = 0;

  for (const invoice of invoices) {
    if (!invoice.createdById) continue;
    const overdueDays = Math.floor(
      (now.getTime() - invoice.dueAt.getTime()) / 86_400_000,
    );
    const result = await queueInternalNotification({
      toUserId: invoice.createdById,
      type: NotificationType.INVOICE_OVERDUE,
      subject: `Faktura po splatnosti: ${invoice.invoiceNumber}`,
      body: `Faktura ${invoice.invoiceNumber} (${invoice.totalCzk} Kč) je ${overdueDays} dní po splatnosti (${invoice.dueAt.toLocaleDateString("cs-CZ")}).\n\n${appUrl(`/invoices/${invoice.id}`)}`,
      entityType: "Invoice",
      entityId: invoice.id,
      dedupeKey: `invoice:${invoice.id}:overdue:${day}`,
    });
    created += result.queued + result.skipped;
  }

  return created;
}

async function createScheduledFiledFollowupNotifications(now: Date) {
  const prisma = getPrisma();
  const tasks = await prisma.task.findMany({
    where: {
      archivedAt: null,
      status: TaskStatus.FILED,
    },
    select: {
      id: true,
      title: true,
      createdById: true,
      assignedToId: true,
      responsibleUserId: true,
      statusHistory: {
        where: { newStatus: TaskStatus.FILED },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, createdAt: true },
      },
    },
  });
  const preferenceCache = new Map<string, NotificationPreferenceShape>();
  let created = 0;

  for (const task of tasks) {
    const filedHistory = task.statusHistory[0];

    if (!filedHistory) {
      continue;
    }

    const recipientIds = uniqueRecipients([
      task.assignedToId,
      task.responsibleUserId,
      task.createdById,
    ]);

    for (const recipientId of recipientIds) {
      const preference = await preferenceForUser(recipientId, preferenceCache);
      const followupAt = new Date(filedHistory.createdAt);
      followupAt.setDate(
        followupAt.getDate() +
          normalizeDays(
            preference.filedFollowupDays,
            DEFAULT_FILED_FOLLOWUP_DAYS,
          ),
      );

      if (now < followupAt) {
        continue;
      }

      const result = await queueInternalNotification({
        toUserId: recipientId,
        type: NotificationType.TASK_FILED_FOLLOWUP,
        subject: `Kontrola po podání: ${task.title}`,
        body: formatTaskNotificationBody({
          title: task.title,
          message: "Úkol je ve statusu Podáno a čeká na kontrolu navazujících kroků.",
          taskId: task.id,
        }),
        entityType: "Task",
        entityId: task.id,
        dedupeKey: `task:${task.id}:filed-followup:${filedHistory.id}`,
      });
      created += result.queued + result.skipped;
    }
  }

  return created;
}

export async function runScheduledNotifications(limit = DEFAULT_SEND_LIMIT) {
  const now = new Date();
  const [deadlineCreated, filedCreated, invoiceCreated] = await Promise.all([
    createScheduledDeadlineNotifications(now),
    createScheduledFiledFollowupNotifications(now),
    createScheduledInvoiceOverdueNotifications(now),
  ]);
  const sendResult = await sendPendingNotifications(limit);

  return {
    created: deadlineCreated + filedCreated + invoiceCreated,
    ...sendResult,
  } satisfies NotificationRunResult;
}
