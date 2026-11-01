import { round2 } from "@/lib/hr/leave-balance";

// Pure attendance math (F7 / HR-4). No DB/clock.

// Worked hours from check-in/out minus breaks; never negative.
export function computeWorkedHours(
  checkIn: Date,
  checkOut: Date,
  breakHours: number,
): number {
  const grossHours = (checkOut.getTime() - checkIn.getTime()) / 3_600_000;
  return Math.max(0, round2(grossHours - breakHours));
}

// Overtime = worked beyond the scheduled daily fund; never negative.
export function computeOvertimeHours(
  workedHours: number,
  scheduleDailyHours: number,
): number {
  return Math.max(0, round2(workedHours - scheduleDailyHours));
}

// The office's default time zone. Attendance workDate is a calendar day in this
// zone, stored as UTC-midnight — so a punch at 23:30 local lands on the local
// day the employee actually worked, not the UTC day.
export const OFFICE_TIME_ZONE = "Europe/Prague";

/**
 * The calendar day (as UTC-midnight) that `now` falls on IN the office time zone.
 * Pure: pass the clock in. Used for the daily attendance key so "today" matches
 * what the employee sees locally, even around the UTC midnight boundary.
 */
export function officeWorkDate(now: Date, timeZone = OFFICE_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

// Offset of `timeZone` from UTC at `instant`, in ms (Prague: +1 h / +2 h in DST).
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Wall-clock time on a calendar day IN the office time zone → the real instant.
 * `workDate` is the UTC-midnight day key (see officeWorkDate). Manual entries and
 * CSV imports must go through this so they match punches, which store `now`.
 */
export function officeWallClockToInstant(
  workDate: Date,
  hour: number,
  minute: number,
  second = 0,
  timeZone = OFFICE_TIME_ZONE,
): Date {
  const naive = Date.UTC(
    workDate.getUTCFullYear(),
    workDate.getUTCMonth(),
    workDate.getUTCDate(),
    hour,
    minute,
    second,
  );
  // Two passes settle the offset across a DST switch.
  const firstGuess = naive - timeZoneOffsetMs(new Date(naive), timeZone);
  return new Date(naive - timeZoneOffsetMs(new Date(firstGuess), timeZone));
}

const officeTimeFormatter = new Intl.DateTimeFormat("cs-CZ", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: OFFICE_TIME_ZONE,
});

/**
 * Time of day („08:05") of an instant in the office time zone — never the
 * server's zone, which is UTC on the VPS/Vercel.
 */
export function formatOfficeTime(instant: Date): string {
  return officeTimeFormatter.format(instant);
}

/**
 * Attendance time for a table cell: just „HH:MM" when the instant falls on the
 * record's day (Prague calendar), else „HH:MM (+1 d)" for a night shift.
 */
export function formatAttendanceTime(instant: Date, workDate: Date): string {
  const time = formatOfficeTime(instant);
  const dayDiff = Math.round(
    (officeWorkDate(instant).getTime() - workDate.getTime()) / 86_400_000,
  );
  if (dayDiff === 0) {
    return time;
  }
  return `${time} (${dayDiff > 0 ? "+" : ""}${dayDiff} d)`;
}

// --- Píchačky: opakovaný příchod/odchod během dne ---------------------------

export type PunchDirection = "in" | "out";

export type PunchRecordState = {
  checkIn: Date | null;
  checkOut: Date | null;
  breakHours: number;
  workedHours: number;
};

export type PunchResult =
  | { ok: true; state: PunchRecordState }
  | { ok: false; error: string };

/** "none" = nic dnes, "in" = v práci (otevřený příchod), "out" = odešel. */
export function punchStatus(
  record: Pick<PunchRecordState, "checkIn" | "checkOut"> | null,
): "none" | "in" | "out" {
  if (!record?.checkIn) {
    return "none";
  }
  return record.checkOut ? "out" : "in";
}

/**
 * Pure punch transition on the day's single attendance record. The day can have
 * any number of příchod/odchod pairs (e.g. lunch): a příchod after an odchod
 * reopens the day and the time spent away is added to the break, so the record
 * keeps first příchod, last odchod and worked = (last out − first in) − breaks.
 */
export function applyPunch(
  existing: PunchRecordState | null,
  direction: PunchDirection,
  now: Date,
): PunchResult {
  const breakHours = existing?.breakHours ?? 0;
  const workedHours = existing?.workedHours ?? 0;
  const status = punchStatus(existing);

  if (direction === "in") {
    if (status === "none") {
      if (existing?.checkOut) {
        return {
          ok: false,
          error: "Dnešní záznam má odchod bez příchodu — opravte docházku ručně.",
        };
      }
      return {
        ok: true,
        state: { checkIn: now, checkOut: null, breakHours, workedHours },
      };
    }
    if (status === "in") {
      return {
        ok: false,
        error: "Příchod už je zaznamenaný — nejdřív zaznamenejte odchod.",
      };
    }
    const awayMs = now.getTime() - existing!.checkOut!.getTime();
    if (awayMs < 0) {
      return {
        ok: false,
        error: `Odchod je zapsaný až na ${formatOfficeTime(existing!.checkOut!)} — upravte docházku ručně.`,
      };
    }
    return {
      ok: true,
      state: {
        checkIn: existing!.checkIn,
        checkOut: null,
        breakHours: round2(breakHours + awayMs / 3_600_000),
        workedHours,
      },
    };
  }

  if (status === "none") {
    return { ok: false, error: "Nejdřív zaznamenejte příchod." };
  }
  if (status === "out") {
    return {
      ok: false,
      error: "Odchod už je zaznamenaný — po návratu zaznamenejte příchod.",
    };
  }
  if (now.getTime() <= existing!.checkIn!.getTime()) {
    return { ok: false, error: "Odchod musí být po příchodu." };
  }
  return {
    ok: true,
    state: {
      checkIn: existing!.checkIn,
      checkOut: now,
      breakHours,
      workedHours: computeWorkedHours(existing!.checkIn!, now, breakHours),
    },
  };
}

// Přestávka a ručně zadané hodiny: po 0,01 h (DB Decimal(·,2)), v rozsahu 0–24.
export function normalizeAttendanceHours(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || value > 24) {
    throw new Error("Hodiny docházky musí být v rozsahu 0–24.");
  }
  return round2(value);
}
