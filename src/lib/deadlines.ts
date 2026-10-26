// Lhůtník – pure helpers for the deadline lifecycle (audit item 09):
// OPEN → splněná (COMPLETED, completedAt/completedById/completionNote)
//      → archivovaná (archivedAt) ↔ obnovená; splněná → vrácená mezi aktivní.
// CANCELLED deadlines are archived on cancel (existing behaviour) and only
// ever appear in the archive view.

import type { Prisma } from "@/generated/prisma/client";
import { DeadlineStatus } from "@/generated/prisma/enums";

export const DEADLINE_LIST_VIEWS = ["active", "fulfilled", "archived"] as const;

export type DeadlineListView = (typeof DEADLINE_LIST_VIEWS)[number];

export const deadlineListViewLabels: Record<DeadlineListView, string> = {
  active: "Aktivní",
  fulfilled: "Splněné",
  archived: "Archiv",
};

export function normalizeDeadlineListView(value: unknown): DeadlineListView {
  return typeof value === "string" &&
    (DEADLINE_LIST_VIEWS as readonly string[]).includes(value)
    ? (value as DeadlineListView)
    : "active";
}

/** Prisma `where` fragment of one Lhůtník tab (compose with visibility). */
export function deadlineListWhere(
  view: DeadlineListView,
): Prisma.DeadlineWhereInput {
  switch (view) {
    case "fulfilled":
      return { archivedAt: null, status: DeadlineStatus.COMPLETED };
    case "archived":
      return { archivedAt: { not: null } };
    default:
      return { archivedAt: null, status: DeadlineStatus.OPEN };
  }
}

/**
 * Deadlines shown in the calendar: open + fulfilled (even archived fulfilled
 * ones stay visible, greyed), never cancelled ones.
 */
export function calendarDeadlineWhere(): Prisma.DeadlineWhereInput {
  return {
    status: { not: DeadlineStatus.CANCELLED },
    OR: [{ archivedAt: null }, { status: DeadlineStatus.COMPLETED }],
  };
}

const pragueDateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date as `YYYY-MM-DD` in the office's time zone (Europe/Prague). */
export function pragueTodayIso(now: Date = new Date()): string {
  return pragueDateFormat.format(now);
}

export const FULFILLED_IN_FUTURE_ERROR =
  "Datum splnění nemůže být v budoucnosti.";
export const FULFILLED_INVALID_ERROR = "Zadejte platné datum splnění.";

/**
 * Parse the "Datum splnění" input (`YYYY-MM-DD`) into the app's date-only
 * convention (UTC midnight). Empty → today in Prague. A date after today
 * (Prague) is rejected with a Czech message.
 */
export function parseFulfilledOn(
  value: string | null | undefined,
  now: Date = new Date(),
): Date {
  const today = pragueTodayIso(now);
  const raw = value?.trim() || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(FULFILLED_INVALID_ERROR);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw
  ) {
    throw new Error(FULFILLED_INVALID_ERROR);
  }
  if (raw > today) {
    throw new Error(FULFILLED_IN_FUTURE_ERROR);
  }
  return parsed;
}
