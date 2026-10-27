// Parse an Outlook-published ICS feed and expand its events for a visible
// calendar range. Pure (no network/DB); uses ical.js for the iCalendar grammar
// and recurrence rules (RRULE/EXDATE/RECURRENCE-ID) but resolves time zones
// itself — never through the global ICAL.TimezoneService, so feeds of
// different users can't influence each other.
//
// Wire format matches the rest of the calendar (FullCalendar runs with
// timeZone="UTC" on "wall clock pinned to UTC" values):
//   all-day → "YYYY-MM-DD" (end exclusive), timed → Prague "YYYY-MM-DDTHH:mm:ss".

import ICAL from "ical.js";

import { IcsFetchError } from "@/lib/calendar/ics-errors";
import {
  CALENDAR_DISPLAY_TIME_ZONE,
  resolveIanaZone,
  toDisplayWallIso,
  zonedWallTimeToUtc,
} from "@/lib/calendar/windows-time-zones";

type IcalComponent = InstanceType<typeof ICAL.Component>;
type IcalTime = InstanceType<typeof ICAL.Time>;
type IcalEvent = InstanceType<typeof ICAL.Event>;

export type ParsedCalendar = {
  root: IcalComponent;
};

export type OutlookOccurrence = {
  /** Stable unique id for the calendar UI. */
  key: string;
  uid: string;
  title: string;
  location?: string;
  allDay: boolean;
  /** UTC instant (all-day: UTC midnight of the date). */
  start: Date;
  end: Date;
  startWire: string;
  endWire: string;
};

export type ExpandOptions = {
  maxOccurrences?: number;
  maxIterationsPerEvent?: number;
};

const MAX_TEXT = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
export const UNTITLED_EVENT = "(bez názvu)";

/** Parse ICS text; anything that isn't a VCALENDAR → IcsFetchError NOT_ICS. */
export function parseIcs(text: string): ParsedCalendar {
  if (typeof text !== "string" || !/BEGIN:VCALENDAR/i.test(text)) {
    throw new IcsFetchError("NOT_ICS");
  }
  let jcal: unknown;
  try {
    jcal = ICAL.parse(text);
  } catch {
    throw new IcsFetchError("NOT_ICS");
  }
  // A file with several VCALENDARs parses to an array; use the first one.
  const first = Array.isArray(jcal) && Array.isArray(jcal[0]) ? jcal[0] : jcal;
  const root = new ICAL.Component(first as never);
  if (root.name !== "vcalendar") {
    throw new IcsFetchError("NOT_ICS");
  }
  return { root };
}

/** Number of distinct events (recurring series count once). */
export function countIcsEvents(parsed: ParsedCalendar): number {
  const uids = new Set<string>();
  let anonymous = 0;
  for (const component of parsed.root.getAllSubcomponents("vevent")) {
    if (isCancelled(component)) {
      continue;
    }
    const uid = component.getFirstPropertyValue("uid");
    if (typeof uid === "string" && uid) {
      uids.add(uid);
    } else {
      anonymous += 1;
    }
  }
  return uids.size + anonymous;
}

function isCancelled(component: IcalComponent): boolean {
  const status = component.getFirstPropertyValue("status");
  return typeof status === "string" && status.toUpperCase() === "CANCELLED";
}

function clip(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > MAX_TEXT ? `${trimmed.slice(0, MAX_TEXT - 1)}…` : trimmed;
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function dateWire(time: { year: number; month: number; day: number }) {
  return `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}`;
}

function naiveUtcMs(time: IcalTime): number {
  return Date.UTC(
    time.year,
    time.month - 1,
    time.day,
    time.isDate ? 0 : time.hour,
    time.isDate ? 0 : time.minute,
    time.isDate ? 0 : time.second,
  );
}

/**
 * UTC instant of an ICS DATE-TIME. Order: explicit UTC ("Z") → TZID resolved
 * to IANA (incl. Windows names) → the feed's own VTIMEZONE (ical.js hydrates
 * it per document) → floating = office zone (Prague).
 */
function instantOf(time: IcalTime, tzid: string | null): Date {
  const zone = time.zone as { tzid?: string } | null | undefined;
  if (zone?.tzid === "UTC") {
    return new Date(naiveUtcMs(time));
  }
  const wall = {
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
  };
  const iana = resolveIanaZone(tzid);
  if (iana) {
    return zonedWallTimeToUtc(wall, iana);
  }
  if (tzid && zone?.tzid && zone.tzid !== "floating") {
    const unix = time.toUnixTime();
    if (Number.isFinite(unix)) {
      return new Date(unix * 1000);
    }
  }
  return zonedWallTimeToUtc(wall, CALENDAR_DISPLAY_TIME_ZONE);
}

function tzidOf(component: IcalComponent, name: "dtstart" | "dtend"): string | null {
  const property = component.getFirstProperty(name);
  const tzid = property?.getParameter("tzid");
  return typeof tzid === "string" ? tzid : Array.isArray(tzid) ? (tzid[0] ?? null) : null;
}

type Span = { allDay: boolean; start: Date; end: Date; startWire: string; endWire: string };

/** Duration of the event item, in ms (timed) or days (all-day). */
function itemLength(item: IcalEvent): { ms: number; days: number } {
  const component = item.component;
  const start = item.startDate;
  const endProperty = component.getFirstProperty("dtend");
  if (start.isDate) {
    let days = 1;
    if (endProperty) {
      const end = item.endDate;
      days = Math.round((naiveUtcMs(end) - naiveUtcMs(start)) / DAY_MS);
    } else if (component.getFirstProperty("duration")) {
      days = Math.round(item.duration.toSeconds() / 86400);
    }
    return { ms: 0, days: Math.max(1, days) };
  }
  if (endProperty) {
    const end = item.endDate;
    const ms =
      instantOf(end, tzidOf(component, "dtend") ?? tzidOf(component, "dtstart")).getTime() -
      instantOf(start, tzidOf(component, "dtstart")).getTime();
    return { ms: Math.max(0, ms), days: 0 };
  }
  if (component.getFirstProperty("duration")) {
    return { ms: Math.max(0, item.duration.toSeconds() * 1000), days: 0 };
  }
  return { ms: 0, days: 0 };
}

function spanOf(startTime: IcalTime, item: IcalEvent): Span {
  const length = itemLength(item);
  if (startTime.isDate) {
    const start = new Date(naiveUtcMs(startTime));
    const end = new Date(start.getTime() + length.days * DAY_MS);
    return {
      allDay: true,
      start,
      end,
      startWire: dateWire(startTime),
      endWire: end.toISOString().slice(0, 10),
    };
  }
  const start = instantOf(startTime, tzidOf(item.component, "dtstart"));
  const end = new Date(start.getTime() + length.ms);
  return {
    allDay: false,
    start,
    end,
    startWire: toDisplayWallIso(start),
    endWire: toDisplayWallIso(end),
  };
}

/** Range test on the wire (pinned) values — the same frame FullCalendar uses. */
function pinnedMs(wire: string): number {
  return new Date(wire.length === 10 ? `${wire}T00:00:00Z` : `${wire}Z`).getTime();
}

function overlaps(span: Span, rangeStart: number, rangeEnd: number): boolean {
  const start = pinnedMs(span.startWire);
  const end = pinnedMs(span.endWire);
  if (end <= start) {
    // Zero-length timed event: inside when its start is inside.
    return start >= rangeStart && start < rangeEnd;
  }
  return start < rangeEnd && end > rangeStart;
}

function occurrenceOf(uid: string, item: IcalEvent, span: Span): OutlookOccurrence {
  return {
    key: `outlook:${uid}:${span.startWire}`,
    uid,
    title: clip(item.summary) ?? UNTITLED_EVENT,
    location: clip(item.location),
    ...span,
  };
}

/**
 * Expand the feed's events into the occurrences overlapping `range`
 * (`[start, end)`). Recurring series are iterated with ical.js (EXDATE and
 * RECURRENCE-ID overrides honoured), cancelled events/occurrences are skipped,
 * and caps bound the work for pathological feeds.
 */
export function expandIcsEvents(
  parsed: ParsedCalendar,
  range: { start: Date; end: Date },
  { maxOccurrences = 1000, maxIterationsPerEvent = 5000 }: ExpandOptions = {},
): OutlookOccurrence[] {
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();
  if (!(rangeEnd > rangeStart)) {
    return [];
  }

  const masters = new Map<string, IcalComponent>();
  const exceptions = new Map<string, IcalComponent[]>();
  let anonymousIndex = 0;
  for (const component of parsed.root.getAllSubcomponents("vevent")) {
    let uid = component.getFirstPropertyValue("uid");
    if (typeof uid !== "string" || !uid) {
      anonymousIndex += 1;
      uid = `anonymous-${anonymousIndex}`;
    }
    if (component.hasProperty("recurrence-id")) {
      const list = exceptions.get(uid) ?? [];
      list.push(component);
      exceptions.set(uid, list);
    } else if (!masters.has(uid)) {
      masters.set(uid, component);
    }
  }

  const result: OutlookOccurrence[] = [];
  const seen = new Set<string>();
  const push = (occurrence: OutlookOccurrence) => {
    if (result.length < maxOccurrences && !seen.has(occurrence.key)) {
      seen.add(occurrence.key);
      result.push(occurrence);
    }
  };

  for (const [uid, masterComponent] of masters) {
    if (result.length >= maxOccurrences) {
      break;
    }
    if (isCancelled(masterComponent)) {
      continue;
    }
    try {
      // exceptions: [] — otherwise ical.js would relate every RECURRENCE-ID
      // VEVENT of the whole calendar; ours are grouped by UID above.
      const event = new ICAL.Event(masterComponent, {
        strictExceptions: true,
        exceptions: [],
      });
      const related = exceptions.get(uid) ?? [];
      for (const exception of related) {
        try {
          event.relateException(exception);
        } catch {
          // An exception that can't be related is ignored (non-compliant feed).
        }
      }
      exceptions.delete(uid);

      if (!event.isRecurring()) {
        const span = spanOf(event.startDate, event);
        if (overlaps(span, rangeStart, rangeEnd)) {
          push(occurrenceOf(uid, event, span));
        }
        continue;
      }

      const handledRecurrenceIds = new Set<string>();
      const iterator = event.iterator();
      // Occurrence starts ≥ range end + 2 days (any zone offset, any override
      // moved by a day) end the scan.
      const stopAt = rangeEnd + 2 * DAY_MS;
      for (let i = 0; i < maxIterationsPerEvent; i += 1) {
        const next = iterator.next();
        if (!next) {
          break;
        }
        if (naiveUtcMs(next) >= stopAt) {
          break;
        }
        const details = event.getOccurrenceDetails(next);
        const item = details.item;
        handledRecurrenceIds.add(details.recurrenceId.toString());
        if (item !== event && isCancelled(item.component)) {
          continue;
        }
        const span = spanOf(details.startDate, item);
        if (overlaps(span, rangeStart, rangeEnd)) {
          push(occurrenceOf(uid, item, span));
          if (result.length >= maxOccurrences) {
            break;
          }
        }
      }

      // Overrides of occurrences the scan never reached (moved INTO the range
      // from beyond it).
      // ical.js keeps exceptions in an object keyed by RECURRENCE-ID.
      const overrides = Object.values(
        event.exceptions as unknown as Record<string, IcalEvent>,
      );
      for (const exception of overrides) {
        if (handledRecurrenceIds.has(exception.recurrenceId.toString())) {
          continue;
        }
        if (isCancelled(exception.component)) {
          continue;
        }
        const span = spanOf(exception.startDate, exception);
        if (overlaps(span, rangeStart, rangeEnd)) {
          push(occurrenceOf(uid, exception, span));
        }
      }
    } catch {
      // One malformed event must not hide the rest of the calendar.
    }
  }

  // Orphan overrides (RECURRENCE-ID without a master in the feed): standalone.
  for (const [uid, list] of exceptions) {
    for (const component of list) {
      if (isCancelled(component)) {
        continue;
      }
      try {
        const event = new ICAL.Event(component, { exceptions: [] });
        const span = spanOf(event.startDate, event);
        if (overlaps(span, rangeStart, rangeEnd)) {
          push(occurrenceOf(uid, event, span));
        }
      } catch {
        // skip
      }
    }
  }

  return result.sort((a, b) => pinnedMs(a.startWire) - pinnedMs(b.startWire));
}
