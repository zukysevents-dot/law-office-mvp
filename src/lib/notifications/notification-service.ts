import type { Prisma } from "@/generated/prisma/client";
import {
  DeadlineStatus,
  NotificationStatus,
  NotificationType,
  TaskStatus,
} from "@/generated/prisma/enums";
import {
  formatMatterAssignedNotification,
  formatTeamJoinedNotification,
  type RecipientNotice,
} from "@/lib/assignments";
import { taskStatusLabels } from "@/lib/labels";
import { formatTaskDeadline } from "@/lib/tasks/deadline-history";
import {
  taskCommentRecipients,
  taskCreatedRecipients,
  taskDeadlineSoonRecipients,
  taskFiledRecipients,
  taskOverdueRecipients,
  taskStatusRecipients,
  type TaskPeopleRecord,
} from "@/lib/tasks/task-people";
import {
  appUrl,
  emailHtml,
  getSmtpTransporter,
  mailConfigStatus,
} from "@/lib/mail/mailer";
import { getPrisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 3;
const DEFAULT_DEADLINE_REMINDER_DAYS = 1;
const DEFAULT_FILED_FOLLOWUP_DAYS = 5;
// Lhůtník (F4 / L-5): procedural deadlines warn earlier than task deadlines.
const DEFAULT_DEADLINE_WATCH_DAYS = 3;
const DEFAULT_SEND_LIMIT = 50;
const LOCK_TIMEOUT_MINUTES = 15;
// Cap how many deadlines/hearings a single scheduled scan loads into memory so a
// large backlog (esp. long-overdue OPEN deadlines) can't overwhelm one cron run.
// Dedupe keys make this safe to resume: unsent rows are picked up next run.
const SCHEDULED_SCAN_LIMIT = 1000;
// Úkol po termínu: upozorňuje se jen na úkoly, jejichž termín uplynul nejvýš
// před tolika dny. Produkční bezpečnost: první běh cronu po nasazení nesmí
// rozeslat e-maily ke všem historicky prošlým úkolům.
export const TASK_OVERDUE_LOOKBACK_DAYS = 7;
// Ukázka komentáře v e-mailu.
const COMMENT_EXCERPT_LENGTH = 300;

export type NotificationPreferenceShape = {
  emailEnabled: boolean;
  taskCreatedEmail: boolean;
  taskStatusChangedEmail: boolean;
  taskForReviewEmail: boolean;
  taskDeadlineSoonEmail: boolean;
  taskFiledFollowupEmail: boolean;
  deadlineReminderDays: number;
  filedFollowupDays: number;
  deadlineSoonEmail: boolean;
  deadlineOverdueEmail: boolean;
  courtHearingSoonEmail: boolean;
  deadlineWatchDaysBefore: number;
  registryChangeEmail: boolean;
  matterAssignedEmail: boolean;
  taskCommentedEmail: boolean;
  taskOverdueEmail: boolean;
  taskDeadlineChangedEmail: boolean;
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

const defaultPreference: NotificationPreferenceShape = {
  emailEnabled: true,
  taskCreatedEmail: true,
  taskStatusChangedEmail: true,
  taskForReviewEmail: true,
  taskDeadlineSoonEmail: true,
  taskFiledFollowupEmail: true,
  deadlineReminderDays: DEFAULT_DEADLINE_REMINDER_DAYS,
  filedFollowupDays: DEFAULT_FILED_FOLLOWUP_DAYS,
  deadlineSoonEmail: true,
  deadlineOverdueEmail: true,
  courtHearingSoonEmail: true,
  deadlineWatchDaysBefore: DEFAULT_DEADLINE_WATCH_DAYS,
  registryChangeEmail: true,
  matterAssignedEmail: true,
  taskCommentedEmail: true,
  taskOverdueEmail: true,
  taskDeadlineChangedEmail: true,
};

export function uniqueRecipients(
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

export function preferenceAllows(
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

  if (type === NotificationType.TASK_DEADLINE_SOON) {
    return current.taskDeadlineSoonEmail;
  }

  if (type === NotificationType.TASK_FILED_FOLLOWUP) {
    return current.taskFiledFollowupEmail;
  }

  if (type === NotificationType.DEADLINE_SOON) {
    return current.deadlineSoonEmail;
  }

  if (type === NotificationType.DEADLINE_OVERDUE) {
    return current.deadlineOverdueEmail;
  }

  if (type === NotificationType.COURT_HEARING_SOON) {
    return current.courtHearingSoonEmail;
  }

  if (type === NotificationType.REGISTRY_CHANGE) {
    return current.registryChangeEmail;
  }

  if (type === NotificationType.MATTER_ASSIGNED) {
    return current.matterAssignedEmail;
  }

  if (type === NotificationType.TASK_COMMENTED) {
    return current.taskCommentedEmail;
  }

  if (type === NotificationType.TASK_OVERDUE) {
    return current.taskOverdueEmail;
  }

  if (type === NotificationType.TASK_DEADLINE_CHANGED) {
    // Starší řádek preferencí (před migrací načtený bez sloupce) = zapnuto.
    return current.taskDeadlineChangedEmail ?? true;
  }

  return false;
}

// Per-recipient contribution to the queued/skipped tally. A notification only
// counts when it was freshly inserted (`wasInserted`): a dedupe hit on an
// existing row contributes nothing. A fresh PENDING row counts as queued, a
// fresh SKIPPED row (preference disabled) as skipped.
export function notificationOutcome(
  status: NotificationStatus,
  wasInserted: boolean,
): { queued: number; skipped: number } {
  if (!wasInserted) {
    return { queued: 0, skipped: 0 };
  }
  if (status === NotificationStatus.PENDING) {
    return { queued: 1, skipped: 0 };
  }
  if (status === NotificationStatus.SKIPPED) {
    return { queued: 0, skipped: 1 };
  }
  // Any other freshly-inserted status (e.g. SENT) counts as neither, matching
  // the original inline fallthrough.
  return { queued: 0, skipped: 0 };
}

// Re-exported for existing callers (invoices, client portal): the transport
// itself lives in src/lib/mail/mailer.ts — one source of truth for SMTP.
export { getSmtpTransporter };

function disabledReason() {
  const config = mailConfigStatus();
  return config.enabled ? "SMTP_NOT_CONFIGURED" : config.reason;
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

// Deadlines/hearings live on a case (no per-deadline detail page) — link to the
// case so the recipient can act on it.
function formatCaseNotificationBody({
  heading,
  message,
  caseId,
}: {
  heading: string;
  message: string;
  caseId: string;
}) {
  return [message, "", heading, `Odkaz: ${appUrl(`/cases/${caseId}`)}`].join(
    "\n",
  );
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
    ...defaultPreference,
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
  // Recipients are independent (each gets its own per-user dedupeKey), so the
  // writes run concurrently rather than one sequential round-trip per user.
  const counts = await Promise.all(
    users.map(async (user) => {
      const allowed =
        user.active && preferenceAllows(user.notificationPreference, type);
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

        // createdAt === updatedAt ⇒ freshly inserted, not a deduped hit.
        const wasInserted =
          notification.createdAt.getTime() ===
          notification.updatedAt.getTime();
        return notificationOutcome(notification.status, wasInserted);
      }

      await prisma.notification.create({ data });
      return notificationOutcome(status, true);
    }),
  );

  const queued = counts.reduce((sum, entry) => sum + entry.queued, 0);
  const skipped = counts.reduce((sum, entry) => sum + entry.skipped, 0);

  return { queued, skipped };
}

type TaskNotificationTask = TaskPeopleRecord & { id: string; title: string };

function sumResults(results: ReadonlyArray<{ queued: number; skipped: number }>) {
  return results.reduce(
    (sum, entry) => ({
      queued: sum.queued + entry.queued,
      skipped: sum.skipped + entry.skipped,
    }),
    { queued: 0, skipped: 0 },
  );
}

// Nový úkol: řešitelé a odpovědná osoba dostanou „Byl vám přiřazen nový úkol“,
// dohled zvlášť s vlastním textem. Typ TASK_CREATED (preference taskCreatedEmail).
export async function queueTaskCreatedNotifications({
  task,
  actorUserId,
}: {
  task: TaskNotificationTask & { shortDescription: string | null };
  actorUserId: string;
}) {
  const { workers, supervisors } = taskCreatedRecipients(task);
  const message = task.shortDescription
    ? `Byl vám přiřazen nový úkol: ${task.shortDescription}`
    : "Byl vám přiřazen nový úkol.";
  const results = await Promise.all([
    queueInternalNotification({
      toUserIds: workers,
      actorUserId,
      type: NotificationType.TASK_CREATED,
      subject: `Nový úkol: ${task.title}`,
      body: formatTaskNotificationBody({
        title: task.title,
        message,
        taskId: task.id,
      }),
      entityType: "Task",
      entityId: task.id,
    }),
    queueInternalNotification({
      toUserIds: supervisors,
      actorUserId,
      type: NotificationType.TASK_CREATED,
      subject: `Dohled nad novým úkolem: ${task.title}`,
      body: formatTaskNotificationBody({
        title: task.title,
        message:
          "Byli jste přidáni jako dohled k úkolu. Úkol vidíte, můžete ho komentovat a měnit jeho status.",
        taskId: task.id,
      }),
      entityType: "Task",
      entityId: task.id,
    }),
  ]);
  return sumResults(results);
}

// Úprava úkolu přidala nové řešitele / dohled: dostanou jen oni (TASK_CREATED).
export async function queueTaskPeopleAddedNotifications({
  task,
  addedAssigneeIds,
  addedSupervisorIds,
  actorUserId,
}: {
  task: { id: string; title: string };
  addedAssigneeIds: readonly string[];
  addedSupervisorIds: readonly string[];
  actorUserId: string;
}) {
  const results = await Promise.all([
    queueInternalNotification({
      toUserIds: [...addedAssigneeIds],
      actorUserId,
      type: NotificationType.TASK_CREATED,
      subject: `Přidání k úkolu: ${task.title}`,
      body: formatTaskNotificationBody({
        title: task.title,
        message: "Byli jste přidáni jako řešitel úkolu.",
        taskId: task.id,
      }),
      entityType: "Task",
      entityId: task.id,
    }),
    queueInternalNotification({
      toUserIds: [...addedSupervisorIds],
      actorUserId,
      type: NotificationType.TASK_CREATED,
      subject: `Dohled nad úkolem: ${task.title}`,
      body: formatTaskNotificationBody({
        title: task.title,
        message:
          "Byli jste přidáni jako dohled k úkolu. Úkol vidíte, můžete ho komentovat a měnit jeho status.",
        taskId: task.id,
      }),
      entityType: "Task",
      entityId: task.id,
    }),
  ]);
  return sumResults(results);
}

// Nový komentář: řešitelé, dohled, odpovědná osoba a zadavatel (bez autora).
export async function queueTaskCommentNotifications({
  task,
  actorUserId,
  authorName,
  comment,
}: {
  task: TaskNotificationTask;
  actorUserId: string;
  authorName: string;
  comment: string;
}) {
  const excerpt =
    comment.length > COMMENT_EXCERPT_LENGTH
      ? `${comment.slice(0, COMMENT_EXCERPT_LENGTH)}…`
      : comment;
  return queueInternalNotification({
    toUserIds: taskCommentRecipients(task),
    actorUserId,
    type: NotificationType.TASK_COMMENTED,
    subject: `Nový komentář k úkolu: ${task.title}`,
    body: formatTaskNotificationBody({
      title: task.title,
      message: `${authorName}: ${excerpt}`,
      taskId: task.id,
    }),
    entityType: "Task",
    entityId: task.id,
  });
}

// Přiřazení k projektům/případům (osobně nebo přes tým): jedna notifikace na
// příjemce — u hromadné akce souhrn. Respektuje preference (matterAssignedEmail)
// a dedupe klíč (opakované odeslání téhož přiřazení nic nezduplikuje).
export async function queueMatterAssignedNotifications({
  notices,
  actorUserId,
}: {
  notices: readonly RecipientNotice[];
  actorUserId: string;
}) {
  const results = await Promise.all(
    notices
      .filter((notice) => notice.items.length > 0)
      .map((notice) => {
        const { subject, body, dedupeKey } = formatMatterAssignedNotification(
          notice.items,
          appUrl,
        );
        const [first] = notice.items;
        return queueInternalNotification({
          toUserId: notice.recipientId,
          actorUserId,
          type: NotificationType.MATTER_ASSIGNED,
          subject,
          body,
          entityType: first.matter.kind === "project" ? "Project" : "Case",
          entityId: first.matter.id,
          dedupeKey,
        });
      }),
  );
  return results.reduce(
    (sum, entry) => ({
      queued: sum.queued + entry.queued,
      skipped: sum.skipped + entry.skipped,
    }),
    { queued: 0, skipped: 0 },
  );
}

// Nový člen týmu: dozví se, ke kterým záznamům mu tým dává přístup.
export async function queueTeamJoinedNotification({
  recipientUserId,
  actorUserId,
  team,
}: {
  recipientUserId: string;
  actorUserId: string;
  team: { id: string; name: string; projectCount: number; caseCount: number };
}) {
  const { subject, body } = formatTeamJoinedNotification(
    {
      teamName: team.name,
      projectCount: team.projectCount,
      caseCount: team.caseCount,
    },
    appUrl,
  );
  return queueInternalNotification({
    toUserId: recipientUserId,
    actorUserId,
    type: NotificationType.MATTER_ASSIGNED,
    subject,
    body,
    entityType: "LegalTeam",
    // Bez dedupe klíče: každé (znovu)přidání do týmu je nová událost.
    entityId: team.id,
  });
}

// Změna statusu: řešitelé, dohled, odpovědná osoba a zadavatel (bez aktéra).
// Poznámka ke změně jde do těla téhož e-mailu (žádný druhý e-mail o komentáři).
export async function queueTaskStatusNotifications({
  task,
  oldStatus,
  newStatus,
  actorUserId,
  note,
}: {
  task: TaskNotificationTask & {
    createdById: string | null;
    responsibleUserId: string | null;
  };
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  actorUserId: string;
  note?: string | null;
}) {
  const statusMessage = `Status se změnil z "${taskStatusLabels[oldStatus]}" na "${taskStatusLabels[newStatus]}".`;
  await queueInternalNotification({
    toUserIds: taskStatusRecipients(task),
    actorUserId,
    type: NotificationType.TASK_STATUS_CHANGED,
    subject: `Změna statusu úkolu: ${task.title}`,
    body: formatTaskNotificationBody({
      title: task.title,
      message: note ? `${statusMessage}\nKomentář: ${note}` : statusMessage,
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

export type TaskDeadlineChangeMode = "postpone" | "edit";

// Text e-mailu o odložení / změně termínu (čistá funkce, unit test).
export function formatTaskDeadlineChangedNotification({
  title,
  oldDeadline,
  newDeadline,
  reason,
  actorName,
  mode,
}: {
  title: string;
  oldDeadline: Date | null;
  newDeadline: Date | null;
  reason?: string | null;
  actorName: string;
  mode: TaskDeadlineChangeMode;
}) {
  const from = formatTaskDeadline(oldDeadline);
  const to = formatTaskDeadline(newDeadline);
  const postponed =
    Boolean(oldDeadline && newDeadline) &&
    (newDeadline as Date).getTime() > (oldDeadline as Date).getTime();
  let sentence: string;
  if (mode === "postpone") {
    sentence = `Termín úkolu byl odložen z ${from} na ${to}.`;
  } else if (oldDeadline && newDeadline) {
    sentence = postponed
      ? `Termín úkolu byl při úpravě odložen z ${from} na ${to}.`
      : `Termín úkolu byl při úpravě změněn z ${from} na ${to}.`;
  } else if (newDeadline) {
    sentence = `Úkolu byl nastaven termín ${to}.`;
  } else {
    sentence = `Termín úkolu (${from}) byl odstraněn.`;
  }
  const lines = [sentence];
  if (reason) {
    lines.push(`Důvod: ${reason}`);
  }
  lines.push(`${mode === "postpone" ? "Odložil(a)" : "Změnil(a)"}: ${actorName}.`);
  return {
    subject:
      mode === "postpone"
        ? `Odložení úkolu: ${title}`
        : `Změna termínu úkolu: ${title}`,
    message: lines.join("\n"),
  };
}

// Odložení nebo změna termínu: řešitelé, dohled, odpovědná osoba a zadavatel
// (bez autora změny). Bez dedupe klíče — každé odložení je nová událost.
export async function queueTaskDeadlineChangedNotifications({
  task,
  oldDeadline,
  newDeadline,
  reason,
  actorUserId,
  actorName,
  mode,
}: {
  task: TaskNotificationTask;
  oldDeadline: Date | null;
  newDeadline: Date | null;
  reason?: string | null;
  actorUserId: string;
  actorName: string;
  mode: TaskDeadlineChangeMode;
}) {
  const { subject, message } = formatTaskDeadlineChangedNotification({
    title: task.title,
    oldDeadline,
    newDeadline,
    reason,
    actorName,
    mode,
  });
  return queueInternalNotification({
    toUserIds: taskStatusRecipients(task),
    actorUserId,
    type: NotificationType.TASK_DEADLINE_CHANGED,
    subject,
    body: formatTaskNotificationBody({ title: task.title, message, taskId: task.id }),
    entityType: "Task",
    entityId: task.id,
  });
}

// Po změně termínu úkolu (v transakci té změny):
//  (a) nevyřízená upozornění „blíží se deadline“ / „po termínu“ na starý termín
//      se už neodešlou (SKIPPED, lastError TASK_DEADLINE_CHANGED);
//  (b) dedupe klíč připomínky „blíží se deadline“ (bez data v klíči) se uvolní,
//      takže plánovač připomínku k NOVÉMU termínu znovu zařadí. Řádek zůstává
//      jako historie. Formát klíče se nemění (žádná vlna duplicit po nasazení).
// Klíč „po termínu“ datum obsahuje (taskOverdueDedupeKey), uvolňovat ho netřeba.
export async function rearmTaskDeadlineNotifications(
  tx: Prisma.TransactionClient,
  taskId: string,
) {
  await tx.notification.updateMany({
    where: {
      entityType: "Task",
      entityId: taskId,
      status: NotificationStatus.PENDING,
      type: {
        in: [NotificationType.TASK_DEADLINE_SOON, NotificationType.TASK_OVERDUE],
      },
    },
    data: { status: NotificationStatus.SKIPPED, lastError: "TASK_DEADLINE_CHANGED" },
  });
  await tx.notification.updateMany({
    where: {
      entityType: "Task",
      entityId: taskId,
      type: NotificationType.TASK_DEADLINE_SOON,
      dedupeKey: { not: null },
    },
    data: { dedupeKey: null },
  });
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
      assignedToId: true,
      responsibleUserId: true,
      assignees: { select: { userId: true, role: true } },
    },
  });
  const preferenceCache = new Map<string, NotificationPreferenceShape>();
  let created = 0;

  for (const task of tasks) {
    const recipientIds = uniqueRecipients(taskDeadlineSoonRecipients(task));

    // Per-recipient reminder window first, then one batched queue call.
    const eligible: string[] = [];
    for (const recipientId of recipientIds) {
      const preference = await preferenceForUser(recipientId, preferenceCache);
      const reminderAt = new Date(task.deadline ?? now);
      reminderAt.setDate(
        reminderAt.getDate() -
          normalizeDays(
            preference.deadlineReminderDays,
            DEFAULT_DEADLINE_REMINDER_DAYS,
          ),
      );

      if (now >= reminderAt) {
        eligible.push(recipientId);
      }
    }

    if (eligible.length === 0) {
      continue;
    }

    const result = await queueInternalNotification({
      toUserIds: eligible,
      type: NotificationType.TASK_DEADLINE_SOON,
      subject: `Blíží se deadline: ${task.title}`,
      body: formatTaskNotificationBody({
        title: task.title,
        message: `Blíží se deadline úkolu: ${task.deadline?.toLocaleDateString("cs-CZ") ?? "bez data"}.`,
        taskId: task.id,
      }),
      entityType: "Task",
      entityId: task.id,
      dedupeKey: `task:${task.id}:deadline-soon`,
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
      assignees: { select: { userId: true, role: true } },
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

    const recipientIds = uniqueRecipients(taskFiledRecipients(task));

    const eligible: string[] = [];
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

      if (now >= followupAt) {
        eligible.push(recipientId);
      }
    }

    if (eligible.length === 0) {
      continue;
    }

    const result = await queueInternalNotification({
      toUserIds: eligible,
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

  return created;
}

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

// Úkol po termínu: nedokončený, nearchivovaný úkol, jehož termín (datum, UTC
// půlnoc) už uplynul — nejvýš TASK_OVERDUE_LOOKBACK_DAYS dní zpět. Jednou na
// hodnotu termínu (datum termínu v dedupe klíči): posunutí termínu upozornění
// znovu „natáhne“. Příjemci: řešitelé, dohled a odpovědná osoba.
export function taskOverdueWindow(now: Date) {
  const today = startOfUtcDay(now);
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - TASK_OVERDUE_LOOKBACK_DAYS);
  return { from, before: today };
}

export function taskOverdueDedupeKey(taskId: string, deadline: Date) {
  return `task:${taskId}:overdue:${deadline.toISOString().slice(0, 10)}`;
}

async function createScheduledTaskOverdueNotifications(now: Date) {
  const prisma = getPrisma();
  const { from, before } = taskOverdueWindow(now);
  const tasks = await prisma.task.findMany({
    where: {
      archivedAt: null,
      status: { not: TaskStatus.COMPLETED },
      deadline: { gte: from, lt: before },
    },
    orderBy: { deadline: "asc" },
    take: SCHEDULED_SCAN_LIMIT,
    select: {
      id: true,
      title: true,
      deadline: true,
      assignedToId: true,
      responsibleUserId: true,
      assignees: { select: { userId: true, role: true } },
    },
  });
  let created = 0;

  for (const task of tasks) {
    if (!task.deadline) {
      continue;
    }
    const recipientIds = uniqueRecipients(taskOverdueRecipients(task));
    if (recipientIds.length === 0) {
      continue;
    }
    const result = await queueInternalNotification({
      toUserIds: recipientIds,
      type: NotificationType.TASK_OVERDUE,
      subject: `Úkol je po termínu: ${task.title}`,
      body: formatTaskNotificationBody({
        title: task.title,
        message: `Termín úkolu uplynul ${task.deadline.toLocaleDateString("cs-CZ", { timeZone: "UTC" })}.`,
        taskId: task.id,
      }),
      entityType: "Task",
      entityId: task.id,
      dedupeKey: taskOverdueDedupeKey(task.id, task.deadline),
    });
    created += result.queued + result.skipped;
  }

  return created;
}

// F4 / L-5: reminders for watched deadlines (Deadline). Two flavours from one
// scan of OPEN, non-archived deadlines:
//   • DEADLINE_SOON — once, when within the recipient's watch window.
//   • DEADLINE_OVERDUE — the deliberate redundant escalation: re-sent ONCE PER
//     DAY (date in the dedupe key) while the deadline stays OPEN past its date.
// A missed procedural deadline is the lawyer's liability, so overdue keeps
// nagging rather than firing a single easily-missed alert.
// Only OPEN, non-archived deadlines are watched: a fulfilled (COMPLETED) or
// archived/cancelled deadline never produces another reminder. dueDate <=
// maxWindow covers both upcoming (≤30d) and any overdue (dueDate<now).
export function deadlineReminderWhere(maxWindow: Date) {
  return {
    archivedAt: null,
    status: DeadlineStatus.OPEN,
    dueDate: { lte: maxWindow },
  } satisfies Prisma.DeadlineWhereInput;
}

async function createScheduledDeadlineReminders(now: Date) {
  const prisma = getPrisma();
  const maxWindow = new Date(now);
  maxWindow.setDate(maxWindow.getDate() + 30);

  const deadlines = await prisma.deadline.findMany({
    where: deadlineReminderWhere(maxWindow),
    orderBy: { dueDate: "asc" },
    take: SCHEDULED_SCAN_LIMIT,
    select: {
      id: true,
      title: true,
      dueDate: true,
      responsibleUserId: true,
      case: { select: { id: true, responsibleUserId: true } },
    },
  });
  const preferenceCache = new Map<string, NotificationPreferenceShape>();
  let created = 0;

  for (const deadline of deadlines) {
    const recipientIds = uniqueRecipients([
      deadline.responsibleUserId,
      deadline.case.responsibleUserId,
    ]);
    const dueLabel = deadline.dueDate.toLocaleDateString("cs-CZ");
    const overdue = deadline.dueDate < now;

    if (overdue) {
      // One escalation per day while OPEN — date stamp in the dedupe key.
      // Every recipient is notified (overdue has no per-recipient window).
      if (recipientIds.length === 0) {
        continue;
      }
      const day = now.toISOString().slice(0, 10);
      const result = await queueInternalNotification({
        toUserIds: recipientIds,
        type: NotificationType.DEADLINE_OVERDUE,
        subject: `Lhůta po termínu: ${deadline.title}`,
        body: formatCaseNotificationBody({
          heading: `Lhůta: ${deadline.title} (termín ${dueLabel})`,
          message: "Lhůta je po termínu a stále není vyřízena.",
          caseId: deadline.case.id,
        }),
        entityType: "Deadline",
        entityId: deadline.id,
        dedupeKey: `deadline:${deadline.id}:overdue:${day}`,
      });
      created += result.queued + result.skipped;
      continue;
    }

    // Upcoming: gate each recipient by their own watch window, then batch.
    const eligible: string[] = [];
    for (const recipientId of recipientIds) {
      const preference = await preferenceForUser(recipientId, preferenceCache);
      const reminderAt = new Date(deadline.dueDate);
      reminderAt.setDate(
        reminderAt.getDate() -
          normalizeDays(
            preference.deadlineWatchDaysBefore,
            DEFAULT_DEADLINE_WATCH_DAYS,
          ),
      );

      if (now >= reminderAt) {
        eligible.push(recipientId);
      }
    }

    if (eligible.length === 0) {
      continue;
    }

    const result = await queueInternalNotification({
      toUserIds: eligible,
      type: NotificationType.DEADLINE_SOON,
      subject: `Blíží se lhůta: ${deadline.title}`,
      body: formatCaseNotificationBody({
        heading: `Lhůta: ${deadline.title} (termín ${dueLabel})`,
        message: `Blíží se termín lhůty: ${dueLabel}.`,
        caseId: deadline.case.id,
      }),
      entityType: "Deadline",
      entityId: deadline.id,
      dedupeKey: `deadline:${deadline.id}:soon`,
    });
    created += result.queued + result.skipped;
  }

  return created;
}

// F4 / L-5: COURT_HEARING_SOON for hearings within the watch window. Fires once
// per hearing/recipient (dedupe `hearing:<id>:soon`).
async function createScheduledCourtHearingReminders(now: Date) {
  const prisma = getPrisma();
  const maxWindow = new Date(now);
  maxWindow.setDate(maxWindow.getDate() + 30);

  const hearings = await prisma.courtHearing.findMany({
    where: {
      archivedAt: null,
      hearingAt: { gte: now, lte: maxWindow },
    },
    orderBy: { hearingAt: "asc" },
    take: SCHEDULED_SCAN_LIMIT,
    select: {
      id: true,
      court: true,
      hearingAt: true,
      responsibleUserId: true,
      case: { select: { id: true, responsibleUserId: true } },
    },
  });
  const preferenceCache = new Map<string, NotificationPreferenceShape>();
  let created = 0;

  for (const hearing of hearings) {
    const recipientIds = uniqueRecipients([
      hearing.responsibleUserId,
      hearing.case.responsibleUserId,
    ]);
    const whenLabel = hearing.hearingAt.toLocaleString("cs-CZ");

    const eligible: string[] = [];
    for (const recipientId of recipientIds) {
      const preference = await preferenceForUser(recipientId, preferenceCache);
      const reminderAt = new Date(hearing.hearingAt);
      reminderAt.setDate(
        reminderAt.getDate() -
          normalizeDays(
            preference.deadlineWatchDaysBefore,
            DEFAULT_DEADLINE_WATCH_DAYS,
          ),
      );

      if (now >= reminderAt) {
        eligible.push(recipientId);
      }
    }

    if (eligible.length === 0) {
      continue;
    }

    const result = await queueInternalNotification({
      toUserIds: eligible,
      type: NotificationType.COURT_HEARING_SOON,
      subject: `Blíží se jednání: ${hearing.court}`,
      body: formatCaseNotificationBody({
        heading: `Jednání: ${hearing.court} (${whenLabel})`,
        message: `Blíží se soudní jednání: ${whenLabel}.`,
        caseId: hearing.case.id,
      }),
      entityType: "CourtHearing",
      entityId: hearing.id,
      dedupeKey: `hearing:${hearing.id}:soon`,
    });
    created += result.queued + result.skipped;
  }

  return created;
}

export async function runScheduledNotifications(limit = DEFAULT_SEND_LIMIT) {
  const now = new Date();
  const [
    deadlineCreated,
    filedCreated,
    watchedCreated,
    hearingCreated,
    overdueCreated,
  ] = await Promise.all([
    createScheduledDeadlineNotifications(now),
    createScheduledFiledFollowupNotifications(now),
    createScheduledDeadlineReminders(now),
    createScheduledCourtHearingReminders(now),
    createScheduledTaskOverdueNotifications(now),
  ]);
  const sendResult = await sendPendingNotifications(limit);

  return {
    created:
      deadlineCreated +
      filedCreated +
      watchedCreated +
      hearingCreated +
      overdueCreated,
    ...sendResult,
  } satisfies NotificationRunResult;
}
