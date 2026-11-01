// Time-zone helpers for the Outlook (ICS) calendar import. Pure, Intl-based —
// no global state, safe to use from any server module and from tests.
//
// Outlook publishes TZIDs as Windows zone names ("Central Europe Standard
// Time"), not IANA names, so they are mapped here (CLDR windowsZones, "001"
// territory). Only the common ones are listed; an unknown zone falls back to
// the feed's own VTIMEZONE definition or, as a last resort, Prague.

/** The zone the office works in; all calendar wall-clock values use it. */
export const CALENDAR_DISPLAY_TIME_ZONE = "Europe/Prague";

const WINDOWS_TO_IANA: Record<string, string> = {
  "Central Europe Standard Time": "Europe/Prague",
  "Central European Standard Time": "Europe/Warsaw",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Bucharest",
  "Russian Standard Time": "Europe/Moscow",
  "Turkey Standard Time": "Europe/Istanbul",
  "Israel Standard Time": "Asia/Jerusalem",
  "Arabian Standard Time": "Asia/Dubai",
  UTC: "UTC",
  "Coordinated Universal Time": "UTC",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "China Standard Time": "Asia/Shanghai",
  "Singapore Standard Time": "Asia/Singapore",
  "Tokyo Standard Time": "Asia/Tokyo",
  "India Standard Time": "Asia/Kolkata",
  "AUS Eastern Standard Time": "Australia/Sydney",
};

const WINDOWS_LOWER = new Map(
  Object.entries(WINDOWS_TO_IANA).map(([name, iana]) => [name.toLowerCase(), iana]),
);

const validZoneCache = new Map<string, boolean>();

function isValidIanaZone(zone: string): boolean {
  const cached = validZoneCache.get(zone);
  if (cached !== undefined) {
    return cached;
  }
  let valid = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    valid = true;
  } catch {
    valid = false;
  }
  if (validZoneCache.size < 500) {
    validZoneCache.set(zone, valid);
  }
  return valid;
}

/**
 * Resolve an ICS TZID to an IANA zone: IANA names pass through, Windows names
 * are mapped, anything else → null. Strips quotes and the "/mozilla.org/…" or
 * "/Microsoft/…" style prefixes some exporters add.
 */
export function resolveIanaZone(tzid: string | null | undefined): string | null {
  if (!tzid) {
    return null;
  }
  const name = tzid.trim().replace(/^"+|"+$/g, "").trim();
  if (!name) {
    return null;
  }
  const windows = WINDOWS_LOWER.get(name.toLowerCase());
  if (windows) {
    return windows;
  }
  if (name.includes("/")) {
    // "/mozilla.org/20050126_1/Europe/Prague" → "Europe/Prague"; plain IANA
    // names ("America/Argentina/Buenos_Aires") match on the first try.
    const segments = name.split("/").filter(Boolean);
    for (let take = Math.min(3, segments.length); take >= 1; take -= 1) {
      const candidate = segments.slice(-take).join("/");
      if (isValidIanaZone(candidate)) {
        return candidate;
      }
    }
    return null;
  }
  if (/^[A-Za-z][A-Za-z0-9_+-]*$/.test(name) && isValidIanaZone(name)) {
    return name;
  }
  return null;
}

export type WallTime = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function wallFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(zone, formatter);
  }
  return formatter;
}

/** Wall-clock fields of the instant `date` in `zone`. */
export function utcToWallTime(date: Date, zone: string): WallTime {
  const parts = wallFormatter(zone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function wallToNaiveUtcMs(wall: WallTime): number {
  return Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
}

/** Offset of `zone` from UTC at the instant `ms`, in milliseconds. */
function offsetAt(ms: number, zone: string): number {
  const wholeSeconds = Math.floor(ms / 1000) * 1000;
  return wallToNaiveUtcMs(utcToWallTime(new Date(wholeSeconds), zone)) - wholeSeconds;
}

/**
 * The UTC instant of a wall-clock time in `zone`, DST-safe. A time inside the
 * spring-forward gap (02:30 on the DST day in Prague) is moved forward by the
 * gap (→ 03:30 summer time); an ambiguous autumn time resolves to the later
 * (standard-time) instant. Both are deterministic.
 */
export function zonedWallTimeToUtc(wall: WallTime, zone: string): Date {
  const naive = wallToNaiveUtcMs(wall);
  const first = offsetAt(naive, zone);
  const candidate = naive - first;
  const second = offsetAt(candidate, zone);
  if (first === second) {
    return new Date(candidate);
  }
  const retry = naive - second;
  const third = offsetAt(retry, zone);
  if (second === third) {
    return new Date(retry);
  }
  // Non-existent wall time (gap): apply the offset in force before the gap.
  return new Date(naive - Math.min(second, third));
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

/** `YYYY-MM-DDTHH:mm:ss` wall clock of `date` in the display zone (Prague). */
export function toDisplayWallIso(date: Date, zone = CALENDAR_DISPLAY_TIME_ZONE): string {
  const wall = utcToWallTime(date, zone);
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
}
