// „Po termínu" vs. „dnes" pro termíny úkolů a lhůt (testování 19. 10.).
//
// Termíny úkolů (Task.deadline) i lhůt (Deadline.dueDate) jsou kalendářní dny
// uložené jako UTC půlnoc (form.ts optionalDate). Dřívější porovnání
// `deadline < now` proto označilo termín „dnes" za prošlý hned po půlnoci UTC.
// Pravidlo: termín je PO TERMÍNU až od následujícího dne kanceláře
// (Europe/Prague); v den termínu je „dnes" (zvýrazněný, ale ne po termínu).
// Stejné hranice používají seznamy, detail, dashboard, filtry, počty i
// upozornění — vše přes tyto helpery.

// Self-contained (no Prisma import) so client components can use it too.
const DAY_MS = 24 * 60 * 60 * 1000;

const pragueDateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's office day as `YYYY-MM-DD` (Europe/Prague). */
function pragueTodayIso(now: Date): string {
  return pragueDateFormat.format(now);
}

export type DueDateState = "overdue" | "today" | "upcoming";

/** Today in Prague as the app's date-only value (UTC midnight). */
export function officeTodayStart(now: Date = new Date()): Date {
  return new Date(`${pragueTodayIso(now)}T00:00:00.000Z`);
}

/** The next office day (UTC midnight) — exclusive end of „dnes". */
export function officeTomorrowStart(now: Date = new Date()): Date {
  return new Date(officeTodayStart(now).getTime() + DAY_MS);
}

/**
 * Prisma bound for „po termínu": `{ lt: overdueBefore(now) }`. A due date on
 * today's office day is NOT overdue yet.
 */
export function overdueBefore(now: Date = new Date()): Date {
  return officeTodayStart(now);
}

function dayIso(value: Date | string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** State of a date-only due date relative to the office day; null = no date. */
export function dueDateState(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): DueDateState | null {
  if (!value) {
    return null;
  }
  const day = dayIso(value);
  if (!day) {
    return null;
  }
  const today = pragueTodayIso(now);
  if (day < today) {
    return "overdue";
  }
  return day === today ? "today" : "upcoming";
}

export function isPastDueDate(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  return dueDateState(value, now) === "overdue";
}

export function isDueToday(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  return dueDateState(value, now) === "today";
}
