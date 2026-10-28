// Odložení úkolu a historie změn termínu. Čistý modul bez runtime importu
// Prisma klienta — sdílí ho server akce, stránky, klientský dialog „Odložit“
// i unit testy.
//
// Termín úkolu (Task.deadline) je datum bez času uložené na UTC půlnoci
// (src/lib/form.ts optionalDate), proto se tu porovnává a formátuje v UTC.

export const TASK_DEADLINE_POSTPONED = "DEADLINE_POSTPONED" as const;
export const TASK_DEADLINE_CHANGED = "DEADLINE_CHANGED" as const;

export type DeadlineEventType =
  | typeof TASK_DEADLINE_POSTPONED
  | typeof TASK_DEADLINE_CHANGED;

export const POSTPONE_REASON_MAX_LENGTH = 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Stejný tvar jako formatDateUtc v src/lib/format.ts (ten ale táhne runtime
// Prismy, takže ho klientský dialog importovat nemůže).
const utcDate = new Intl.DateTimeFormat("cs-CZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/** „03. 10. 2026“ — datum termínu úkolu (UTC půlnoc). */
export function formatTaskDeadline(value: Date | null | undefined): string {
  return value ? utcDate.format(value) : "—";
}

/** `YYYY-MM-DD` z data uloženého na UTC půlnoci. */
export function deadlineIso(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

/** `YYYY-MM-DD` → Date na UTC půlnoci; neplatné datum → null. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  const raw = value?.trim() ?? "";
  if (!ISO_DATE.test(raw)) {
    return null;
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  // Kalendářně neplatné datum (2026-02-30) by Date „přetočil“ na jiný den.
  return Number.isNaN(date.getTime()) || deadlineIso(date) !== raw ? null : date;
}

function sameDay(left: Date, right: Date) {
  return deadlineIso(left) === deadlineIso(right);
}

/**
 * Druh změny termínu: stejné datum (nebo obě prázdná) → null, posun na pozdější
 * datum → DEADLINE_POSTPONED, cokoli jiného (dřívější, nastavení, odstranění)
 * → DEADLINE_CHANGED.
 */
export function classifyDeadlineChange(
  oldDeadline: Date | null | undefined,
  newDeadline: Date | null | undefined,
): DeadlineEventType | null {
  if (!oldDeadline && !newDeadline) {
    return null;
  }
  if (oldDeadline && newDeadline) {
    if (sameDay(oldDeadline, newDeadline)) {
      return null;
    }
    return newDeadline.getTime() > oldDeadline.getTime()
      ? TASK_DEADLINE_POSTPONED
      : TASK_DEADLINE_CHANGED;
  }
  return TASK_DEADLINE_CHANGED;
}

export const POSTPONE_ERRORS = {
  missing: "Zadejte nový termín.",
  invalid: "Zadejte platné datum nového termínu.",
  noDeadline:
    "Úkol nemá termín. Termín nastavte v úpravě úkolu.",
  closed: "Dokončený nebo archivovaný úkol nelze odložit.",
  past: "Nový termín nemůže být v minulosti.",
  notLater: (current: Date) =>
    `Nový termín musí být pozdější než současný termín (${formatTaskDeadline(current)}). Dřívější termín nastavte v úpravě úkolu.`,
} as const;

export type PostponeValidation =
  | { ok: true; newDeadline: Date }
  | { ok: false; error: string };

export function validatePostpone({
  currentDeadline,
  newDeadlineIso,
  todayIso,
  closed,
}: {
  currentDeadline: Date | null;
  newDeadlineIso: string | null | undefined;
  /** Dnešek v Praze (`YYYY-MM-DD`). */
  todayIso: string;
  /** Úkol je dokončený nebo archivovaný. */
  closed: boolean;
}): PostponeValidation {
  if (closed) {
    return { ok: false, error: POSTPONE_ERRORS.closed };
  }
  if (!currentDeadline) {
    return { ok: false, error: POSTPONE_ERRORS.noDeadline };
  }
  if (!newDeadlineIso?.trim()) {
    return { ok: false, error: POSTPONE_ERRORS.missing };
  }
  const newDeadline = parseIsoDate(newDeadlineIso);
  if (!newDeadline) {
    return { ok: false, error: POSTPONE_ERRORS.invalid };
  }
  if (newDeadline.getTime() <= currentDeadline.getTime() || sameDay(newDeadline, currentDeadline)) {
    return { ok: false, error: POSTPONE_ERRORS.notLater(currentDeadline) };
  }
  if (deadlineIso(newDeadline) < todayIso) {
    return { ok: false, error: POSTPONE_ERRORS.past };
  }
  return { ok: true, newDeadline };
}

/** Ořízne důvod odložení na povolenou délku; prázdný → null. */
export function clampPostponeReason(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, POSTPONE_REASON_MAX_LENGTH) : null;
}

export type DeadlineHistoryEvent = {
  type: string;
  oldDeadline: Date | null;
  newDeadline: Date | null;
  createdAt: Date;
};

export type DeadlineHistorySummary = {
  /** Termín před první zaznamenanou změnou (null = úkol termín neměl). */
  originalDeadline: Date | null;
  /** Počet posunů na pozdější datum (Odložit i úprava úkolu). */
  postponeCount: number;
  /** Termín se od zavedení historie změnil. */
  changed: boolean;
};

const DEADLINE_TYPES: ReadonlySet<string> = new Set([
  TASK_DEADLINE_POSTPONED,
  TASK_DEADLINE_CHANGED,
]);

/**
 * Souhrn historie termínu z událostí úkolu (libovolné pořadí, seřadí se
 * chronologicky). Původní termín = oldDeadline první změny termínu.
 */
export function summarizeDeadlineHistory(
  events: readonly DeadlineHistoryEvent[],
): DeadlineHistorySummary {
  const deadlineEvents = events
    .filter((event) => DEADLINE_TYPES.has(event.type))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  if (deadlineEvents.length === 0) {
    return { originalDeadline: null, postponeCount: 0, changed: false };
  }
  return {
    originalDeadline: deadlineEvents[0].oldDeadline,
    postponeCount: deadlineEvents.filter(
      (event) => event.type === TASK_DEADLINE_POSTPONED,
    ).length,
    changed: true,
  };
}

function daysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Posun data `YYYY-MM-DD` o dny / měsíce (rychlé volby „+1 týden“, „+1 měsíc“).
 * Měsíc se zarovná na poslední den kratšího měsíce (31. 1. + 1 měsíc → 28./29. 2.).
 * Neplatný vstup → "".
 */
export function addToIsoDate(
  iso: string,
  { days = 0, months = 0 }: { days?: number; months?: number },
): string {
  const date = parseIsoDate(iso);
  if (!date) {
    return "";
  }
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth();
  let day = date.getUTCDate();
  if (months) {
    const total = year * 12 + month + months;
    year = Math.floor(total / 12);
    month = total - year * 12;
    day = Math.min(day, daysInUtcMonth(year, month));
  }
  const shifted = new Date(Date.UTC(year, month, day) + days * 86_400_000);
  return deadlineIso(shifted);
}

/**
 * Nejmenší povolený nový termín pro `min` v dialogu: pozdější z (dnes) a
 * (současný termín + 1 den).
 */
export function minimumPostponeIso(currentIso: string, todayIso: string): string {
  const next = addToIsoDate(currentIso, { days: 1 });
  if (!next) {
    return todayIso;
  }
  return next > todayIso ? next : todayIso;
}
