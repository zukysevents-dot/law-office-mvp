/**
 * Registry-monitoring runner. Periodically re-checks watch-enabled subjects
 * against ARES (which carries the insolvency-register + dissolution signals),
 * detects changes via the pure `diffRegistryStatus`, and on a change: updates the
 * subject (escalating risk only — never auto-clears a lawyer's flag), records a
 * RegistryChangeEvent, writes an audit entry, and queues a notification to the
 * responsible lawyers. Triggered by the Bearer-authed cron route.
 *
 * ARES is external + rate-limited, so a run is capped and each subject's
 * registryCheckedAt is stamped even on error so the runner rotates fairly.
 */

import { NotificationType, UserRole } from "@/generated/prisma/enums";
import { fetchAresSubject } from "@/lib/ares/client";
import { normalizeIco } from "@/lib/ares/ico";
import { mapAresToSubjectFields } from "@/lib/ares/mapper";
import { auditJson } from "@/lib/audit";
import { queueInternalNotification } from "@/lib/notifications/notification-service";
import { getPrisma } from "@/lib/prisma";
import {
  diffRegistryStatus,
  registryNotificationBody,
  registryNotificationSubject,
} from "@/lib/registry-monitor";

// Batch cap per run. Sized so worst-case (all ARES calls timing out at 15s)
// stays under the route's maxDuration; the oldest-checked-first rotation and
// frequent cron cover the full subject set over time.
const DEFAULT_CHECK_LIMIT = 20;

type WatchedSubject = {
  id: string;
  organizationId: string;
  name: string;
  ico: string | null;
  insolvencyStatus: string | null;
  mainProjects: Array<{ responsibleUserId: string | null }>;
};

// Recipients: responsible lawyers of the subject's matters; fall back to the
// org's ADMIN/PARTNER when the subject has no responsible user anywhere.
async function resolveRecipients(subject: WatchedSubject): Promise<string[]> {
  const responsible = subject.mainProjects
    .map((project) => project.responsibleUserId)
    .filter((id): id is string => Boolean(id));
  if (responsible.length > 0) {
    return [...new Set(responsible)];
  }
  const admins = await getPrisma().organizationMember.findMany({
    where: {
      organizationId: subject.organizationId,
      status: "ACTIVE",
      role: { in: [UserRole.ADMIN, UserRole.PARTNER] },
    },
    select: { userId: true },
  });
  return [...new Set(admins.map((member) => member.userId))];
}

const WATCHED_SUBJECT_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  ico: true,
  insolvencyStatus: true,
  mainProjects: {
    where: { archivedAt: null },
    select: { responsibleUserId: true },
  },
} as const;

type CheckOutcome = "unchanged" | "changed" | "error";

// Check one subject against ARES and apply/notify any change. Assumes the caller
// has already authorized access (the cron run and the per-subject action both
// gate before calling). Always stamps registryCheckedAt.
async function checkOneSubject(subject: WatchedSubject): Promise<CheckOutcome> {
  const prisma = getPrisma();
  const now = new Date();
  const ico = normalizeIco(subject.ico);
  if (!ico) {
    await prisma.subject.update({
      where: { id: subject.id },
      data: { registryCheckedAt: now },
    });
    return "unchanged";
  }

  const result = await fetchAresSubject(ico);
  if (result.status !== "ok") {
    // Stamp the check time regardless so we don't hammer one subject; a
    // transient ARES error just retries on a later run.
    await prisma.subject.update({
      where: { id: subject.id },
      data: { registryCheckedAt: now },
    });
    return result.status === "error" ? "error" : "unchanged";
  }

  const next = mapAresToSubjectFields(result.data);
  const change = diffRegistryStatus(subject.insolvencyStatus, next);
  if (!change) {
    await prisma.subject.update({
      where: { id: subject.id },
      data: { registryCheckedAt: now },
    });
    return "unchanged";
  }

  await prisma.$transaction(async (tx) => {
    await tx.subject.update({
      where: { id: subject.id },
      data: {
        insolvencyStatus: change.newValue,
        registryCheckedAt: now,
        // Only ever escalate automatically; de-escalation is the lawyer's call.
        ...(change.raisesRisk ? { riskFlag: true } : {}),
      },
    });
    await tx.registryChangeEvent.create({
      data: {
        organizationId: subject.organizationId,
        subjectId: subject.id,
        changeType: change.changeType,
        summary: change.summary,
        oldValue: change.oldValue,
        newValue: change.newValue,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "Subject",
        entityId: subject.id,
        action: "REGISTRY_CHANGE",
        // System-initiated (no acting user) — changedById is nullable.
        newValue: auditJson({
          changeType: change.changeType,
          oldValue: change.oldValue,
          newValue: change.newValue,
        }),
      },
    });
  });

  const recipients = await resolveRecipients(subject);
  await queueInternalNotification({
    type: NotificationType.REGISTRY_CHANGE,
    toUserIds: recipients,
    subject: registryNotificationSubject(subject.name),
    body: registryNotificationBody(subject.name, change),
    entityType: "Subject",
    entityId: subject.id,
    // Dedupe per subject + resulting status so re-runs never double-notify.
    dedupeKey: `registry:${subject.id}:${change.changeType}:${change.newValue ?? "cleared"}`,
  });

  return "changed";
}

export type RegistryRunResult = {
  checked: number;
  changed: number;
  errors: number;
};

export async function runRegistryChecks(
  limit = DEFAULT_CHECK_LIMIT,
): Promise<RegistryRunResult> {
  const prisma = getPrisma();

  const subjects = await prisma.subject.findMany({
    where: { registryWatchEnabled: true, archivedAt: null, ico: { not: null } },
    // Oldest-checked (and never-checked) first so a capped run rotates fairly.
    orderBy: [{ registryCheckedAt: { sort: "asc", nulls: "first" } }],
    take: limit,
    select: WATCHED_SUBJECT_SELECT,
  });

  let checked = 0;
  let changed = 0;
  let errors = 0;

  for (const subject of subjects) {
    checked += 1;
    try {
      const outcome = await checkOneSubject(subject);
      if (outcome === "changed") {
        changed += 1;
      } else if (outcome === "error") {
        errors += 1;
      }
    } catch {
      // One subject's failure (DB/tx/notify) must not abort the whole batch.
      // Best-effort stamp so the runner rotates past it next time.
      errors += 1;
      await prisma.subject
        .update({
          where: { id: subject.id },
          data: { registryCheckedAt: new Date() },
        })
        .catch(() => {});
    }
  }

  return { checked, changed, errors };
}

/**
 * On-demand single-subject re-check (the "Zkontrolovat teď" button). The caller
 * MUST authorize access to the subject first. Returns the outcome, or "error"
 * when the subject is not found (defensive — the action already validated it).
 */
export async function runRegistryCheckForSubject(
  subjectId: string,
): Promise<CheckOutcome> {
  // Manual check ignores the watch toggle (explicit user intent) but still skips
  // archived subjects — consistent with the batch runner not touching them.
  const subject = await getPrisma().subject.findFirst({
    where: { id: subjectId, archivedAt: null },
    select: WATCHED_SUBJECT_SELECT,
  });
  if (!subject) {
    return "error";
  }
  return checkOneSubject(subject);
}
