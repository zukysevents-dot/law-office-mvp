// Prodloužení lhůty (testování 19. 10.): nový termín + povinný důvod. Čisté
// helpery (validace a shrnutí historie) — zápis dělá extendDeadline v
// app/actions/deadlines.ts (oprávnění, DeadlineExtension řádek, audit).

export const EXTENSION_REASON_MAX = 2000;

export const EXTENSION_DATE_INVALID_ERROR = "Zadejte platný nový termín.";
export const EXTENSION_NOT_LATER_ERROR =
  "Nový termín musí být pozdější než současný termín lhůty.";
export const EXTENSION_REASON_REQUIRED_ERROR = "Uveďte důvod prodloužení.";
export const EXTENSION_REASON_TOO_LONG_ERROR = "Důvod prodloužení je příliš dlouhý.";

export type DeadlineExtensionInput = {
  newDueDate: Date;
  reason: string;
};

/**
 * Validate the „Prodloužit lhůtu" form. `newDueIso` is the `<input
 * type="date">` value (`YYYY-MM-DD`), stored as UTC midnight like every
 * date-only field. The new date must be strictly after the current due date
 * (shortening/correcting a date is the regular edit, not an extension).
 * Throws a Czech message on invalid input.
 */
export function parseDeadlineExtension(
  currentDueDate: Date,
  newDueIso: string | null | undefined,
  reasonInput: string | null | undefined,
): DeadlineExtensionInput {
  const raw = newDueIso?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(EXTENSION_DATE_INVALID_ERROR);
  }
  const newDueDate = new Date(`${raw}T00:00:00.000Z`);
  if (
    Number.isNaN(newDueDate.getTime()) ||
    newDueDate.toISOString().slice(0, 10) !== raw
  ) {
    throw new Error(EXTENSION_DATE_INVALID_ERROR);
  }
  const currentDay = currentDueDate.toISOString().slice(0, 10);
  if (raw <= currentDay) {
    throw new Error(EXTENSION_NOT_LATER_ERROR);
  }

  const reason = reasonInput?.trim() ?? "";
  if (!reason) {
    throw new Error(EXTENSION_REASON_REQUIRED_ERROR);
  }
  if (reason.length > EXTENSION_REASON_MAX) {
    throw new Error(EXTENSION_REASON_TOO_LONG_ERROR);
  }

  return { newDueDate, reason };
}

export type DeadlineExtensionRecord = {
  previousDueDate: Date;
  newDueDate: Date;
  createdAt: Date;
};

/**
 * Summary for the deadline row: how many times it was extended and the
 * ORIGINAL due date (the previous date of the oldest extension).
 */
export function deadlineExtensionSummary(
  extensions: readonly DeadlineExtensionRecord[],
): { count: number; originalDueDate: Date | null } {
  if (extensions.length === 0) {
    return { count: 0, originalDueDate: null };
  }
  const oldest = extensions.reduce((first, current) =>
    current.createdAt.getTime() < first.createdAt.getTime() ? current : first,
  );
  return { count: extensions.length, originalDueDate: oldest.previousDueDate };
}
