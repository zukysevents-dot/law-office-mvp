import assert from "node:assert/strict";
import { test } from "node:test";

import { NotificationStatus, NotificationType } from "@/generated/prisma/enums";

import {
  type NotificationPreferenceShape,
  TASK_OVERDUE_LOOKBACK_DAYS,
  notificationOutcome,
  formatTaskDeadlineChangedNotification,
  preferenceAllows,
  taskOverdueDedupeKey,
  taskOverdueWindow,
  uniqueRecipients,
} from "./notification-service";

// All per-type flags default to `true`; individual tests flip the one flag
// under test. Typed to NotificationPreferenceShape so the test breaks at
// compile time if the shape changes.
function preference(
  overrides: Partial<NotificationPreferenceShape> = {},
): NotificationPreferenceShape {
  return {
    emailEnabled: true,
    taskCreatedEmail: true,
    taskStatusChangedEmail: true,
    taskForReviewEmail: true,
    taskDeadlineSoonEmail: true,
    taskFiledFollowupEmail: true,
    deadlineReminderDays: 1,
    filedFollowupDays: 5,
    deadlineSoonEmail: true,
    deadlineOverdueEmail: true,
    courtHearingSoonEmail: true,
    deadlineWatchDaysBefore: 3,
    registryChangeEmail: true,
    matterAssignedEmail: true,
    taskCommentedEmail: true,
    taskOverdueEmail: true,
    taskDeadlineChangedEmail: true,
    ...overrides,
  };
}

const allow = (
  pref: NotificationPreferenceShape | null | undefined,
  type: NotificationType,
) => preferenceAllows(pref, type);

// --- uniqueRecipients --------------------------------------------------------

test("uniqueRecipients: deduplicates repeated ids", () => {
  assert.deepEqual(uniqueRecipients(["a", "b", "a", "b", "a"]), ["a", "b"]);
});

test("uniqueRecipients: excludes the actor", () => {
  assert.deepEqual(uniqueRecipients(["a", "b", "c"], "b"), ["a", "c"]);
});

test("uniqueRecipients: drops null and undefined entries", () => {
  assert.deepEqual(
    uniqueRecipients(["a", null, undefined, "b", null]),
    ["a", "b"],
  );
});

test("uniqueRecipients: preserves first-occurrence order", () => {
  assert.deepEqual(uniqueRecipients(["c", "a", "b", "a", "c"]), ["c", "a", "b"]);
});

test("uniqueRecipients: actor plus null/dup combined", () => {
  assert.deepEqual(
    uniqueRecipients(["self", "x", null, "x", "self", "y"], "self"),
    ["x", "y"],
  );
});

test("uniqueRecipients: empty input => empty array", () => {
  assert.deepEqual(uniqueRecipients([]), []);
});

// --- preferenceAllows --------------------------------------------------------

test("preferenceAllows: emailEnabled=false blocks every type", () => {
  const pref = preference({ emailEnabled: false });
  for (const type of Object.values(NotificationType)) {
    assert.equal(allow(pref, type), false, `expected false for ${type}`);
  }
});

test("preferenceAllows: per-type flag is respected (true vs false)", () => {
  assert.equal(
    allow(preference({ taskCreatedEmail: true }), NotificationType.TASK_CREATED),
    true,
  );
  assert.equal(
    allow(preference({ taskCreatedEmail: false }), NotificationType.TASK_CREATED),
    false,
  );

  assert.equal(
    allow(
      preference({ deadlineOverdueEmail: false }),
      NotificationType.DEADLINE_OVERDUE,
    ),
    false,
  );
  assert.equal(
    allow(
      preference({ courtHearingSoonEmail: false }),
      NotificationType.COURT_HEARING_SOON,
    ),
    false,
  );
});

test("preferenceAllows: disabling one type does not affect others", () => {
  const pref = preference({ taskCreatedEmail: false });
  assert.equal(allow(pref, NotificationType.TASK_CREATED), false);
  assert.equal(allow(pref, NotificationType.TASK_STATUS_CHANGED), true);
  assert.equal(allow(pref, NotificationType.DEADLINE_SOON), true);
});

test("preferenceAllows: null preference falls back to the (allow-by-default) defaults", () => {
  // Every defined type defaults to true.
  for (const type of Object.values(NotificationType)) {
    assert.equal(allow(null, type), true, `expected default-allow for ${type}`);
    assert.equal(
      allow(undefined, type),
      true,
      `expected default-allow for ${type}`,
    );
  }
});

test("preferenceAllows: covers each notification type flag", () => {
  const cases: Array<[NotificationType, string]> = [
    [NotificationType.TASK_CREATED, "taskCreatedEmail"],
    [NotificationType.TASK_STATUS_CHANGED, "taskStatusChangedEmail"],
    [NotificationType.TASK_FOR_REVIEW, "taskForReviewEmail"],
    [NotificationType.TASK_DEADLINE_SOON, "taskDeadlineSoonEmail"],
    [NotificationType.TASK_FILED_FOLLOWUP, "taskFiledFollowupEmail"],
    [NotificationType.DEADLINE_SOON, "deadlineSoonEmail"],
    [NotificationType.DEADLINE_OVERDUE, "deadlineOverdueEmail"],
    [NotificationType.COURT_HEARING_SOON, "courtHearingSoonEmail"],
    [NotificationType.TASK_COMMENTED, "taskCommentedEmail"],
    [NotificationType.TASK_OVERDUE, "taskOverdueEmail"],
    [NotificationType.TASK_DEADLINE_CHANGED, "taskDeadlineChangedEmail"],
  ];
  for (const [type, flag] of cases) {
    assert.equal(allow(preference({ [flag]: false }), type), false, flag);
    assert.equal(allow(preference({ [flag]: true }), type), true, flag);
  }
});

// --- notificationOutcome -----------------------------------------------------

test("notificationOutcome: freshly inserted PENDING => queued", () => {
  assert.deepEqual(notificationOutcome(NotificationStatus.PENDING, true), {
    queued: 1,
    skipped: 0,
  });
});

test("notificationOutcome: freshly inserted SKIPPED => skipped", () => {
  assert.deepEqual(notificationOutcome(NotificationStatus.SKIPPED, true), {
    queued: 0,
    skipped: 1,
  });
});

test("notificationOutcome: dedupe hit (not inserted) contributes nothing", () => {
  assert.deepEqual(notificationOutcome(NotificationStatus.PENDING, false), {
    queued: 0,
    skipped: 0,
  });
  assert.deepEqual(notificationOutcome(NotificationStatus.SKIPPED, false), {
    queued: 0,
    skipped: 0,
  });
});

test("notificationOutcome: freshly inserted non-PENDING/SKIPPED status is neutral", () => {
  // Unreachable from the current call-site (status is always PENDING/SKIPPED),
  // but locks the defensive fallthrough so a future status doesn't get counted.
  assert.deepEqual(notificationOutcome(NotificationStatus.SENT, true), {
    queued: 0,
    skipped: 0,
  });
});

test("preferenceAllows: MATTER_ASSIGNED follows matterAssignedEmail and the master switch", () => {
  assert.equal(allow(preference(), NotificationType.MATTER_ASSIGNED), true);
  assert.equal(
    allow(preference({ matterAssignedEmail: false }), NotificationType.MATTER_ASSIGNED),
    false,
  );
  assert.equal(
    allow(preference({ emailEnabled: false }), NotificationType.MATTER_ASSIGNED),
    false,
  );
  // Ostatní typy přepínač přiřazení neovlivní.
  assert.equal(
    allow(preference({ matterAssignedEmail: false }), NotificationType.TASK_CREATED),
    true,
  );
});

test("preferenceAllows: TASK_COMMENTED / TASK_OVERDUE honour the master switch", () => {
  for (const type of [NotificationType.TASK_COMMENTED, NotificationType.TASK_OVERDUE]) {
    assert.equal(allow(null, type), true);
    assert.equal(allow(preference({ emailEnabled: false }), type), false);
  }
  // Vypnutý komentář neovlivní upozornění po termínu a naopak.
  assert.equal(
    allow(preference({ taskCommentedEmail: false }), NotificationType.TASK_OVERDUE),
    true,
  );
  assert.equal(
    allow(preference({ taskOverdueEmail: false }), NotificationType.TASK_COMMENTED),
    true,
  );
});

test("taskOverdueWindow: only deadlines before today and within the lookback", () => {
  const now = new Date("2026-10-27T10:15:00.000Z");
  const { from, before } = taskOverdueWindow(now);
  assert.equal(before.toISOString(), "2026-10-27T00:00:00.000Z");
  assert.equal(
    from.toISOString(),
    `2026-10-${String(27 - TASK_OVERDUE_LOOKBACK_DAYS).padStart(2, "0")}T00:00:00.000Z`,
  );
  // Dnešní termín ještě není po termínu.
  const today = new Date("2026-10-27T00:00:00.000Z");
  assert.equal(today < before, false);
});

test("taskOverdueDedupeKey: one alert per deadline value", () => {
  const a = taskOverdueDedupeKey("t1", new Date("2026-10-20T00:00:00.000Z"));
  const b = taskOverdueDedupeKey("t1", new Date("2026-10-21T00:00:00.000Z"));
  assert.equal(a, "task:t1:overdue:2026-10-20");
  assert.notEqual(a, b);
});

// --- odložení / změna termínu úkolu --------------------------------------------

test("preferenceAllows: TASK_DEADLINE_CHANGED respektuje vlastní přepínač i emailEnabled", () => {
  assert.equal(
    allow(preference({ taskDeadlineChangedEmail: false }), NotificationType.TASK_DEADLINE_CHANGED),
    false,
  );
  assert.equal(
    allow(
      preference({ emailEnabled: false, taskDeadlineChangedEmail: true }),
      NotificationType.TASK_DEADLINE_CHANGED,
    ),
    false,
  );
  // Vypnutá změna statusu odložení neovlivní.
  assert.equal(
    allow(preference({ taskStatusChangedEmail: false }), NotificationType.TASK_DEADLINE_CHANGED),
    true,
  );
  // Bez řádku preferencí platí výchozí (zapnuto).
  assert.equal(allow(null, NotificationType.TASK_DEADLINE_CHANGED), true);
});

test("formatTaskDeadlineChangedNotification: odložení s důvodem", () => {
  const { subject, message } = formatTaskDeadlineChangedNotification({
    title: "Žaloba",
    oldDeadline: new Date("2026-10-12T00:00:00.000Z"),
    newDeadline: new Date("2026-10-20T00:00:00.000Z"),
    reason: "čekáme na podklady",
    actorName: "Admin Demo",
    mode: "postpone",
  });
  assert.equal(subject, "Odložení úkolu: Žaloba");
  assert.equal(
    message,
    "Termín úkolu byl odložen z 12. 10. 2026 na 20. 10. 2026.\nDůvod: čekáme na podklady\nOdložil(a): Admin Demo.",
  );
});

test("formatTaskDeadlineChangedNotification: změna při úpravě úkolu", () => {
  const later = formatTaskDeadlineChangedNotification({
    title: "Žaloba",
    oldDeadline: new Date("2026-10-12T00:00:00.000Z"),
    newDeadline: new Date("2026-10-20T00:00:00.000Z"),
    actorName: "Advokát Demo",
    mode: "edit",
  });
  assert.equal(later.subject, "Změna termínu úkolu: Žaloba");
  assert.match(later.message, /^Termín úkolu byl při úpravě odložen z 12\. 10\. 2026 na 20\. 10\. 2026\./);
  assert.match(later.message, /Změnil\(a\): Advokát Demo\.$/);

  const earlier = formatTaskDeadlineChangedNotification({
    title: "Žaloba",
    oldDeadline: new Date("2026-10-20T00:00:00.000Z"),
    newDeadline: new Date("2026-10-12T00:00:00.000Z"),
    actorName: "Advokát Demo",
    mode: "edit",
  });
  assert.match(earlier.message, /při úpravě změněn z 20\. 10\. 2026 na 12\. 10\. 2026/);

  const removed = formatTaskDeadlineChangedNotification({
    title: "Žaloba",
    oldDeadline: new Date("2026-10-20T00:00:00.000Z"),
    newDeadline: null,
    actorName: "Advokát Demo",
    mode: "edit",
  });
  assert.match(removed.message, /^Termín úkolu \(20\. 10\. 2026\) byl odstraněn\./);
});
