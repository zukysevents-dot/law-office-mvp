"use server";

import { revalidatePath } from "next/cache";

import type { Prisma } from "@/generated/prisma/client";
import {
  DeadlineStatus,
  DeadlineType,
  NotificationStatus,
} from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { parseFulfilledOn } from "@/lib/deadlines";
import { getCurrentUser } from "@/lib/auth";
import {
  enumValue,
  optionalDate,
  optionalString,
  requiredDate,
  requiredDateTime,
  requiredString,
} from "@/lib/form";
import {
  andWhere,
  assertCanManageDeadlines,
  caseVisibilityWhere,
  courtHearingVisibilityWhere,
  dataMessageVisibilityWhere,
  deadlineVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { assertCanAccessModule } from "@/lib/module-access.server";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

const MAX_TITLE = 300;
const MAX_TEXT = 2000;

// Shared preamble for every mutation: entitlement (fail-closed) → role gate →
// resolve org. Mirrors aml.ts. Returns the user + non-null organizationId.
async function authorize(): Promise<{
  currentUser: CurrentUser;
  organizationId: string;
}> {
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.deadlines");
  assertCanManageDeadlines(currentUser);

  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }

  return { currentUser, organizationId };
}

// Load a case the user may see (org + visibility). Anchors every deadline to a
// case the caller is actually allowed to touch — never a bare findUnique.
async function loadVisibleCase(currentUser: CurrentUser, caseId: string) {
  return getPrisma().case.findFirst({
    where: andWhere({ id: caseId }, caseVisibilityWhere(currentUser)),
    select: { id: true, responsibleUserId: true },
  });
}

// If a responsible user is named, it MUST be an active member of the same org —
// prevents assigning a deadline across organizations.
async function validateResponsible(
  organizationId: string,
  responsibleUserId: string | null,
): Promise<string | null> {
  if (!responsibleUserId) {
    return null;
  }
  const member = await getPrisma().organizationMember.findFirst({
    where: {
      organizationId,
      userId: responsibleUserId,
      status: "ACTIVE",
    },
    select: { userId: true },
  });
  if (!member) {
    throw new Error("Odpovědná osoba není členem této kanceláře.");
  }
  return responsibleUserId;
}

function clampText(value: string | null, max: number): string | null {
  if (value && value.length > max) {
    throw new Error("Text je příliš dlouhý.");
  }
  return value;
}

// Every page that lists deadlines (the dashboard has the „Blížící se lhůty"
// widget and the calendar preview).
function revalidateDeadline(caseId: string) {
  revalidatePath("/deadlines");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath(`/cases/${caseId}`);
}

// --- Deadlines (L-3) ---------------------------------------------------------

// L-3: create a deadline on a case. dueDate is entered by the lawyer — the
// software never computes legal due dates. A past dueDate is allowed (deadlines
// may be recorded retroactively); the UI warns instead of blocking.
export async function createDeadline(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const caseId = requiredString(formData, "caseId");
  const title = clampText(requiredString(formData, "title"), MAX_TITLE)!;
  const type = enumValue(DeadlineType, formData.get("type"), DeadlineType.PROCEDURAL);
  const dueDate = requiredDate(formData, "dueDate");
  const originEvent = clampText(optionalString(formData, "originEvent"), MAX_TITLE);
  const originDate = optionalDate(formData, "originDate");
  const computedRule = clampText(optionalString(formData, "computedRule"), MAX_TITLE);
  const note = clampText(optionalString(formData, "note"), MAX_TEXT);
  const responsibleUserId = await validateResponsible(
    organizationId,
    optionalString(formData, "responsibleUserId"),
  );

  const legalCase = await loadVisibleCase(currentUser, caseId);
  if (!legalCase) {
    throw new Error("Případ nenalezen.");
  }

  await prisma.$transaction(async (tx) => {
    const created = await tx.deadline.create({
      data: {
        organizationId,
        caseId,
        type,
        title,
        dueDate,
        originEvent,
        originDate,
        computedRule,
        note,
        responsibleUserId,
        createdById: currentUser.id,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "Deadline",
        entityId: created.id,
        action: "CREATE",
        changedById: currentUser.id,
        newValue: auditJson({
          caseId,
          type,
          title,
          dueDate: dueDate.toISOString(),
          responsibleUserId,
        }),
      },
    });
  });

  revalidateDeadline(caseId);
}

// L-3: edit an open deadline. Loaded via deadlineVisibilityWhere so a user can
// only edit deadlines within their visibility scope (org + role-derived).
export async function updateDeadline(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const deadlineId = requiredString(formData, "deadlineId");
  const existing = await prisma.deadline.findFirst({
    where: andWhere({ id: deadlineId }, deadlineVisibilityWhere(currentUser)),
    select: {
      id: true,
      caseId: true,
      type: true,
      title: true,
      dueDate: true,
      responsibleUserId: true,
    },
  });
  if (!existing) {
    throw new Error("Lhůta nenalezena.");
  }

  const title = clampText(requiredString(formData, "title"), MAX_TITLE)!;
  const type = enumValue(DeadlineType, formData.get("type"), existing.type);
  const dueDate = requiredDate(formData, "dueDate");
  const originEvent = clampText(optionalString(formData, "originEvent"), MAX_TITLE);
  const originDate = optionalDate(formData, "originDate");
  const computedRule = clampText(optionalString(formData, "computedRule"), MAX_TITLE);
  const note = clampText(optionalString(formData, "note"), MAX_TEXT);
  const responsibleUserId = await validateResponsible(
    organizationId,
    optionalString(formData, "responsibleUserId"),
  );

  await prisma.$transaction(async (tx) => {
    await tx.deadline.update({
      where: { id: deadlineId },
      data: {
        type,
        title,
        dueDate,
        originEvent,
        originDate,
        computedRule,
        note,
        responsibleUserId,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "Deadline",
        entityId: deadlineId,
        action: "UPDATE",
        changedById: currentUser.id,
        oldValue: auditJson({
          type: existing.type,
          title: existing.title,
          dueDate: existing.dueDate.toISOString(),
          responsibleUserId: existing.responsibleUserId,
        }),
        newValue: auditJson({
          type,
          title,
          dueDate: dueDate.toISOString(),
          responsibleUserId,
        }),
      },
    });
  });

  revalidateDeadline(existing.caseId);
}

// --- Splnění, archivace a obnovení lhůty (audit 09) ---------------------------

export type DeadlineActionState = {
  ok: boolean;
  error?: string;
  submittedAt?: number;
};

const NOT_FULFILLABLE_ERROR =
  "Lhůtu nelze označit jako splněnou – je zrušená nebo archivovaná.";

// Notifications already queued for this deadline (PENDING, or FAILED waiting
// for a retry) must not go out once the obligation is fulfilled/cancelled.
function skipQueuedDeadlineNotifications(
  tx: Prisma.TransactionClient,
  deadlineId: string,
  reason: string,
) {
  return tx.notification.updateMany({
    where: {
      entityType: "Deadline",
      entityId: deadlineId,
      status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] },
    },
    data: { status: NotificationStatus.SKIPPED, lastError: reason, lockedAt: null },
  });
}

// Reopening a fulfilled deadline must re-arm its reminders: the rows skipped
// at fulfilment still hold their dedupeKey (`deadline:<id>:soon:<user>`), which
// would stop the scheduler from ever queueing them again. Release the key; the
// skipped row stays as history.
function releaseSkippedDeadlineNotifications(
  tx: Prisma.TransactionClient,
  deadlineId: string,
) {
  return tx.notification.updateMany({
    where: {
      entityType: "Deadline",
      entityId: deadlineId,
      status: NotificationStatus.SKIPPED,
      lastError: "DEADLINE_COMPLETED",
      dedupeKey: { not: null },
    },
    data: { dedupeKey: null },
  });
}

// „Splněno" — marks the obligation tied to the deadline as fulfilled (who,
// when, optional note); mode "fulfil-archive" also archives it in one step.
// For useActionState: validation problems come back inline, auth failures
// throw like every other deadline action.
export async function fulfillDeadline(
  _previous: DeadlineActionState,
  formData: FormData,
): Promise<DeadlineActionState> {
  const submittedAt = Date.now();
  const prisma = getPrisma();
  const { currentUser } = await authorize();

  const deadlineId = requiredString(formData, "deadlineId");
  const archive = formData.get("mode") === "fulfil-archive";

  let completedAt: Date;
  let completionNote: string | null;
  try {
    completedAt = parseFulfilledOn(optionalString(formData, "fulfilledOn"));
    completionNote = clampText(optionalString(formData, "completionNote"), MAX_TEXT);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Neplatné údaje.",
      submittedAt,
    };
  }

  const existing = await prisma.deadline.findFirst({
    where: andWhere({ id: deadlineId }, deadlineVisibilityWhere(currentUser)),
    select: {
      id: true,
      caseId: true,
      status: true,
      archivedAt: true,
      completedAt: true,
    },
  });
  if (!existing) {
    return { ok: false, error: "Lhůta nenalezena.", submittedAt };
  }
  if (existing.status === DeadlineStatus.CANCELLED || existing.archivedAt) {
    return { ok: false, error: NOT_FULFILLABLE_ERROR, submittedAt };
  }

  const now = new Date();

  // Already fulfilled (double submit, second tab): keep the original
  // completion; only archive when that was asked for.
  if (existing.status === DeadlineStatus.COMPLETED) {
    if (archive) {
      await prisma.$transaction(async (tx) => {
        await tx.deadline.update({
          where: { id: deadlineId },
          data: { archivedAt: now },
        });
        await tx.auditLog.create({
          data: {
            organizationId: currentUser.organizationId,
            entityType: "Deadline",
            entityId: deadlineId,
            action: "ARCHIVE",
            changedById: currentUser.id,
            oldValue: auditJson({ archived: false }),
            newValue: auditJson({ archived: true }),
          },
        });
      });
    }
    revalidateDeadline(existing.caseId);
    return { ok: true, submittedAt };
  }

  await prisma.$transaction(async (tx) => {
    await tx.deadline.update({
      where: { id: deadlineId },
      data: {
        status: DeadlineStatus.COMPLETED,
        completedAt,
        completedById: currentUser.id,
        completionNote,
        archivedAt: archive ? now : undefined,
      },
    });

    await skipQueuedDeadlineNotifications(tx, deadlineId, "DEADLINE_COMPLETED");

    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "Deadline",
        entityId: deadlineId,
        action: archive ? "COMPLETE_ARCHIVE" : "COMPLETE",
        changedById: currentUser.id,
        oldValue: auditJson({ status: existing.status, archived: false }),
        newValue: auditJson({
          status: DeadlineStatus.COMPLETED,
          completedAt: completedAt.toISOString(),
          completionNote,
          archived: archive,
        }),
      },
    });
  });

  revalidateDeadline(existing.caseId);
  return { ok: true, submittedAt };
}

async function loadFulfilledDeadline(currentUser: CurrentUser, deadlineId: string) {
  return getPrisma().deadline.findFirst({
    where: andWhere(
      { id: deadlineId, status: DeadlineStatus.COMPLETED },
      deadlineVisibilityWhere(currentUser),
    ),
    select: {
      id: true,
      caseId: true,
      archivedAt: true,
      completedAt: true,
      completedById: true,
      completionNote: true,
    },
  });
}

// Archive a fulfilled deadline (reversible — „Obnovit z archivu").
export async function archiveDeadline(formData: FormData) {
  const { currentUser } = await authorize();
  const deadlineId = requiredString(formData, "deadlineId");
  const existing = await loadFulfilledDeadline(currentUser, deadlineId);
  if (!existing) {
    throw new Error("Archivovat lze jen splněnou lhůtu.");
  }
  if (existing.archivedAt) {
    revalidateDeadline(existing.caseId);
    return;
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.deadline.update({
      where: { id: deadlineId },
      data: { archivedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "Deadline",
        entityId: deadlineId,
        action: "ARCHIVE",
        changedById: currentUser.id,
        oldValue: auditJson({ archived: false }),
        newValue: auditJson({ archived: true }),
      },
    });
  });

  revalidateDeadline(existing.caseId);
}

// Restore an archived fulfilled deadline back to „Splněné". Cancelled
// deadlines stay archived (cancel is final, like before).
export async function restoreDeadline(formData: FormData) {
  const { currentUser } = await authorize();
  const deadlineId = requiredString(formData, "deadlineId");
  const existing = await loadFulfilledDeadline(currentUser, deadlineId);
  if (!existing) {
    throw new Error("Obnovit lze jen splněnou lhůtu.");
  }
  if (!existing.archivedAt) {
    revalidateDeadline(existing.caseId);
    return;
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.deadline.update({
      where: { id: deadlineId },
      data: { archivedAt: null },
    });
    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "Deadline",
        entityId: deadlineId,
        action: "RESTORE",
        changedById: currentUser.id,
        oldValue: auditJson({ archived: true }),
        newValue: auditJson({ archived: false }),
      },
    });
  });

  revalidateDeadline(existing.caseId);
}

// Undo a mistaken „Splněno": the deadline becomes OPEN again and is watched
// (reminders) as before. Only for non-archived fulfilled deadlines.
export async function reopenDeadline(formData: FormData) {
  const { currentUser } = await authorize();
  const deadlineId = requiredString(formData, "deadlineId");
  const existing = await loadFulfilledDeadline(currentUser, deadlineId);
  if (!existing) {
    throw new Error("Vrátit mezi aktivní lze jen splněnou lhůtu.");
  }
  if (existing.archivedAt) {
    throw new Error("Lhůtu nejdřív obnovte z archivu.");
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.deadline.update({
      where: { id: deadlineId },
      data: {
        status: DeadlineStatus.OPEN,
        completedAt: null,
        completedById: null,
        completionNote: null,
      },
    });
    await releaseSkippedDeadlineNotifications(tx, deadlineId);
    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "Deadline",
        entityId: deadlineId,
        action: "REOPEN",
        changedById: currentUser.id,
        oldValue: auditJson({
          status: DeadlineStatus.COMPLETED,
          completedAt: existing.completedAt?.toISOString() ?? null,
          completedById: existing.completedById,
          completionNote: existing.completionNote,
        }),
        newValue: auditJson({ status: DeadlineStatus.OPEN }),
      },
    });
  });

  revalidateDeadline(existing.caseId);
}

// L-3: cancel a deadline (CANCELLED keeps the audit trail; not a hard delete).
export async function cancelDeadline(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser } = await authorize();

  const deadlineId = requiredString(formData, "deadlineId");
  const existing = await prisma.deadline.findFirst({
    where: andWhere({ id: deadlineId }, deadlineVisibilityWhere(currentUser)),
    select: { id: true, caseId: true, status: true },
  });
  if (!existing) {
    throw new Error("Lhůta nenalezena.");
  }

  if (existing.status === DeadlineStatus.CANCELLED) {
    revalidateDeadline(existing.caseId);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.deadline.update({
      where: { id: deadlineId },
      data: { status: DeadlineStatus.CANCELLED, archivedAt: new Date() },
    });

    await skipQueuedDeadlineNotifications(tx, deadlineId, "DEADLINE_CANCELLED");

    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "Deadline",
        entityId: deadlineId,
        action: "CANCEL",
        changedById: currentUser.id,
        oldValue: auditJson({ status: existing.status }),
        newValue: auditJson({ status: DeadlineStatus.CANCELLED }),
      },
    });
  });

  revalidateDeadline(existing.caseId);
}

// --- Court hearings (L-4) ----------------------------------------------------

// L-4: create a court hearing on a case. hearingAt carries a time (datetime).
export async function createCourtHearing(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const caseId = requiredString(formData, "caseId");
  const court = clampText(requiredString(formData, "court"), MAX_TITLE)!;
  const hearingAt = requiredDateTime(formData, "hearingAt");
  const room = clampText(optionalString(formData, "room"), MAX_TITLE);
  const note = clampText(optionalString(formData, "note"), MAX_TEXT);
  const responsibleUserId = await validateResponsible(
    organizationId,
    optionalString(formData, "responsibleUserId"),
  );

  const legalCase = await loadVisibleCase(currentUser, caseId);
  if (!legalCase) {
    throw new Error("Případ nenalezen.");
  }

  await prisma.$transaction(async (tx) => {
    const created = await tx.courtHearing.create({
      data: {
        organizationId,
        caseId,
        court,
        hearingAt,
        room,
        note,
        responsibleUserId,
        createdById: currentUser.id,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "CourtHearing",
        entityId: created.id,
        action: "CREATE",
        changedById: currentUser.id,
        newValue: auditJson({
          caseId,
          court,
          hearingAt: hearingAt.toISOString(),
          responsibleUserId,
        }),
      },
    });
  });

  revalidateDeadline(caseId);
}

// L-4: edit a court hearing within the caller's visibility scope.
export async function updateCourtHearing(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const hearingId = requiredString(formData, "hearingId");
  const existing = await prisma.courtHearing.findFirst({
    where: andWhere({ id: hearingId }, courtHearingVisibilityWhere(currentUser)),
    select: {
      id: true,
      caseId: true,
      court: true,
      hearingAt: true,
      responsibleUserId: true,
    },
  });
  if (!existing) {
    throw new Error("Jednání nenalezeno.");
  }

  const court = clampText(requiredString(formData, "court"), MAX_TITLE)!;
  const hearingAt = requiredDateTime(formData, "hearingAt");
  const room = clampText(optionalString(formData, "room"), MAX_TITLE);
  const note = clampText(optionalString(formData, "note"), MAX_TEXT);
  const responsibleUserId = await validateResponsible(
    organizationId,
    optionalString(formData, "responsibleUserId"),
  );

  await prisma.$transaction(async (tx) => {
    await tx.courtHearing.update({
      where: { id: hearingId },
      data: { court, hearingAt, room, note, responsibleUserId },
    });

    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "CourtHearing",
        entityId: hearingId,
        action: "UPDATE",
        changedById: currentUser.id,
        oldValue: auditJson({
          court: existing.court,
          hearingAt: existing.hearingAt.toISOString(),
          responsibleUserId: existing.responsibleUserId,
        }),
        newValue: auditJson({
          court,
          hearingAt: hearingAt.toISOString(),
          responsibleUserId,
        }),
      },
    });
  });

  revalidateDeadline(existing.caseId);
}

// L-4: cancel a court hearing (soft delete via archivedAt — keeps the record).
export async function cancelCourtHearing(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser } = await authorize();

  const hearingId = requiredString(formData, "hearingId");
  const existing = await prisma.courtHearing.findFirst({
    where: andWhere({ id: hearingId }, courtHearingVisibilityWhere(currentUser)),
    select: { id: true, caseId: true, archivedAt: true },
  });
  if (!existing) {
    throw new Error("Jednání nenalezeno.");
  }

  if (existing.archivedAt) {
    revalidateDeadline(existing.caseId);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.courtHearing.update({
      where: { id: hearingId },
      data: { archivedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "CourtHearing",
        entityId: hearingId,
        action: "CANCEL",
        changedById: currentUser.id,
        newValue: auditJson({ archived: true }),
      },
    });
  });

  revalidateDeadline(existing.caseId);
}

// --- L-6: deadline from a delivered data message -----------------------------

// L-6: create a procedural deadline from a delivered data message. The seam is
// the F2 DataMessage.acceptedAt/deliveredAt. We DO NOT compute the dueDate — the
// lawyer enters and confirms it; we only pre-fill the origin (event/date) and
// link the source message for traceability.
export async function createDeadlineFromDataMessage(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const dataMessageId = requiredString(formData, "dataMessageId");
  const message = await prisma.dataMessage.findFirst({
    where: andWhere(
      { id: dataMessageId },
      dataMessageVisibilityWhere(currentUser),
    ),
    select: {
      id: true,
      caseId: true,
      acceptedAt: true,
      deliveredAt: true,
    },
  });
  if (!message) {
    throw new Error("Datová zpráva nenalezena.");
  }
  if (!message.caseId) {
    throw new Error(
      "Datová zpráva není přiřazena ke spisu — lhůtu lze založit jen na spisu.",
    );
  }

  // Anchor the case through caseVisibilityWhere too (defense-in-depth, same as
  // createDeadline) — don't trust the message's caseId alone for org isolation.
  const legalCase = await loadVisibleCase(currentUser, message.caseId);
  if (!legalCase) {
    throw new Error("Případ nenalezen.");
  }

  const title = clampText(requiredString(formData, "title"), MAX_TITLE)!;
  const dueDate = requiredDate(formData, "dueDate"); // lawyer-confirmed, never computed
  const computedRule = clampText(optionalString(formData, "computedRule"), MAX_TITLE);
  const note = clampText(optionalString(formData, "note"), MAX_TEXT);
  const responsibleUserId = await validateResponsible(
    organizationId,
    optionalString(formData, "responsibleUserId"),
  );
  const originDate = message.acceptedAt ?? message.deliveredAt ?? null;

  await prisma.$transaction(async (tx) => {
    const created = await tx.deadline.create({
      data: {
        organizationId,
        caseId: message.caseId!,
        type: DeadlineType.PROCEDURAL,
        title,
        dueDate,
        originEvent: "doručení datové zprávy",
        originDate,
        computedRule,
        note,
        responsibleUserId,
        sourceDataMessageId: message.id,
        createdById: currentUser.id,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: currentUser.organizationId,
        entityType: "Deadline",
        entityId: created.id,
        action: "CREATE_FROM_DS",
        changedById: currentUser.id,
        newValue: auditJson({
          caseId: message.caseId,
          sourceDataMessageId: message.id,
          title,
          dueDate: dueDate.toISOString(),
          originDate: originDate?.toISOString() ?? null,
        }),
      },
    });
  });

  revalidatePath("/deadlines");
  revalidatePath("/calendar");
  revalidatePath(`/cases/${message.caseId}`);
  revalidatePath(`/data-boxes/${message.id}`);
}
