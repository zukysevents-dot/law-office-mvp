import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOutlookSampleIcs,
  CUSTOM_VTIMEZONE_ICS,
  OUTLOOK_NO_VTIMEZONE_ICS,
  OUTLOOK_SAMPLE_ICS,
  vevent,
  wrapCalendar,
} from "@/lib/calendar/__fixtures__/outlook-sample";
import { IcsFetchError } from "@/lib/calendar/ics-errors";
import {
  countIcsEvents,
  expandIcsEvents,
  parseIcs,
  UNTITLED_EVENT,
} from "@/lib/calendar/ics-parse";

const range = (start: string, end: string) => ({
  start: new Date(start),
  end: new Date(end),
});

const sample = parseIcs(OUTLOOK_SAMPLE_ICS);
const autumn = expandIcsEvents(sample, range("2026-10-01T00:00:00Z", "2026-12-01T00:00:00Z"));
const byUid = (uid: string) => autumn.filter((occurrence) => occurrence.uid === uid);

test("timed event with a Windows TZID gets the Prague wall clock and the right instant", () => {
  const [single] = byUid("040000008200E00074C5B7101A82E00800000000single");
  assert.ok(single);
  assert.equal(single.title, "Porada s klientem");
  assert.equal(single.location, "Zasedačka 2");
  assert.equal(single.allDay, false);
  assert.equal(single.startWire, "2026-10-27T10:00:00");
  assert.equal(single.endWire, "2026-10-27T11:00:00");
  // 27 Oct 2026 is CET (+1).
  assert.equal(single.start.toISOString(), "2026-10-27T09:00:00.000Z");
  assert.equal(single.end.toISOString(), "2026-10-27T10:00:00.000Z");
  assert.equal(single.key, "outlook:040000008200E00074C5B7101A82E00800000000single:2026-10-27T10:00:00");
});

test("Windows TZID without a VTIMEZONE block still resolves to Prague (DST day)", () => {
  const [event] = expandIcsEvents(
    parseIcs(OUTLOOK_NO_VTIMEZONE_ICS),
    range("2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z"),
  );
  assert.ok(event);
  assert.equal(event.start.toISOString(), "2026-03-29T07:00:00.000Z");
  assert.equal(event.startWire, "2026-03-29T09:00:00");
});

test("an unknown TZID falls back to the feed's own VTIMEZONE", () => {
  const [event] = expandIcsEvents(
    parseIcs(CUSTOM_VTIMEZONE_ICS),
    range("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"),
  );
  assert.ok(event);
  // 12:00 at +03:00 = 09:00Z = 10:00 Prague (CET).
  assert.equal(event.start.toISOString(), "2026-10-27T09:00:00.000Z");
  assert.equal(event.startWire, "2026-10-27T10:00:00");
});

test("UTC and floating times", () => {
  const [utc] = byUid("utc-event");
  assert.equal(utc.start.toISOString(), "2026-10-28T13:00:00.000Z");
  assert.equal(utc.startWire, "2026-10-28T14:00:00");
  assert.equal(utc.endWire, "2026-10-28T14:30:00");

  const [floating] = byUid("floating-event");
  assert.equal(floating.startWire, "2026-10-29T09:00:00");
  assert.equal(floating.start.toISOString(), "2026-10-29T08:00:00.000Z");
});

test("all-day events keep their dates (DTEND exclusive), no time-zone shift", () => {
  const [single] = byUid("all-day-single");
  assert.equal(single.allDay, true);
  assert.equal(single.startWire, "2026-10-28");
  assert.equal(single.endWire, "2026-10-29");

  const [multi] = byUid("all-day-multi");
  assert.equal(multi.allDay, true);
  assert.equal(multi.startWire, "2026-11-02");
  assert.equal(multi.endWire, "2026-11-05");
});

test("all-day event without DTEND lasts one day", () => {
  const parsed = parseIcs(
    wrapCalendar([vevent(["UID:no-end", "SUMMARY:Bez konce", "DTSTART;VALUE=DATE:20261028"])]),
  );
  const [event] = expandIcsEvents(parsed, range("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"));
  assert.equal(event.startWire, "2026-10-28");
  assert.equal(event.endWire, "2026-10-29");
});

test("weekly RRULE: EXDATE removes, RECURRENCE-ID moves, DST keeps 10:00", () => {
  const series = byUid("weekly-series");
  assert.deepEqual(
    series.map((occurrence) => occurrence.startWire),
    [
      "2026-10-13T10:00:00",
      "2026-10-20T10:00:00",
      "2026-10-27T10:00:00", // after the DST end — still 10:00 wall clock
      "2026-11-11T14:00:00", // 10 Nov moved to 11 Nov 14:00
      "2026-11-17T10:00:00",
    ],
  );
  // 3 Nov is excluded by EXDATE.
  assert.ok(!series.some((occurrence) => occurrence.startWire.startsWith("2026-11-03")));
  assert.equal(series[1].start.toISOString(), "2026-10-20T08:00:00.000Z"); // CEST
  assert.equal(series[2].start.toISOString(), "2026-10-27T09:00:00.000Z"); // CET
  assert.equal(series[3].title, "Týdenní porada (přesunuto)");
});

test("expansion is clipped to the visible range", () => {
  const week = expandIcsEvents(sample, range("2026-10-19T00:00:00Z", "2026-10-26T00:00:00Z"));
  assert.deepEqual(
    week.map((occurrence) => occurrence.startWire),
    ["2026-10-20T10:00:00"],
  );
});

test("an override moved into the range from beyond the scanned window shows", () => {
  const moved = expandIcsEvents(sample, range("2026-11-11T00:00:00Z", "2026-11-12T00:00:00Z"));
  assert.deepEqual(
    moved.map((occurrence) => occurrence.title),
    ["Týdenní porada (přesunuto)"],
  );
});

test("an event overlapping the range start is included", () => {
  const parsed = parseIcs(
    wrapCalendar([
      vevent([
        "UID:overnight",
        "SUMMARY:Přes půlnoc",
        "DTSTART;TZID=Central Europe Standard Time:20261026T220000",
        "DTEND;TZID=Central Europe Standard Time:20261027T020000",
      ]),
    ]),
  );
  const events = expandIcsEvents(parsed, range("2026-10-27T00:00:00Z", "2026-10-28T00:00:00Z"));
  assert.equal(events.length, 1);
  assert.equal(events[0].endWire, "2026-10-27T02:00:00");
});

test("cancelled events never show; missing SUMMARY gets a placeholder", () => {
  assert.equal(byUid("cancelled-event").length, 0);
  assert.equal(byUid("untitled-event")[0].title, UNTITLED_EVENT);
});

test("cancelled single occurrence of a series is hidden", () => {
  const parsed = parseIcs(
    wrapCalendar([
      vevent([
        "UID:series",
        "SUMMARY:Série",
        "DTSTART;TZID=Central Europe Standard Time:20261005T090000",
        "DTEND;TZID=Central Europe Standard Time:20261005T100000",
        "RRULE:FREQ=DAILY;COUNT=3",
      ]),
      vevent([
        "UID:series",
        "RECURRENCE-ID;TZID=Central Europe Standard Time:20261006T090000",
        "SUMMARY:Série",
        "DTSTART;TZID=Central Europe Standard Time:20261006T090000",
        "DTEND;TZID=Central Europe Standard Time:20261006T100000",
        "STATUS:CANCELLED",
      ]),
    ]),
  );
  const events = expandIcsEvents(parsed, range("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"));
  assert.deepEqual(
    events.map((event) => event.startWire),
    ["2026-10-05T09:00:00", "2026-10-07T09:00:00"],
  );
});

test("caps bound the number of occurrences", () => {
  const parsed = parseIcs(
    wrapCalendar([
      vevent([
        "UID:endless",
        "SUMMARY:Každý den",
        "DTSTART;TZID=Central Europe Standard Time:20260101T080000",
        "DTEND;TZID=Central Europe Standard Time:20260101T081500",
        "RRULE:FREQ=DAILY",
      ]),
    ]),
  );
  const all = expandIcsEvents(parsed, range("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"));
  assert.equal(all.length, 365);
  const capped = expandIcsEvents(
    parsed,
    range("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"),
    { maxOccurrences: 10 },
  );
  assert.equal(capped.length, 10);
  const iterationCapped = expandIcsEvents(
    parsed,
    range("2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z"),
    { maxIterationsPerEvent: 50 },
  );
  assert.equal(iterationCapped.length, 0);
});

test("non-ICS input is rejected as NOT_ICS", () => {
  for (const text of ["<html><body>Outlook</body></html>", "", "BEGIN:VCALENDAR\r\nBROKEN"]) {
    assert.throws(
      () => parseIcs(text),
      (error: unknown) => error instanceof IcsFetchError && error.code === "NOT_ICS",
    );
  }
});

test("countIcsEvents counts series once and skips cancelled ones", () => {
  // single, utc, floating, 2× all-day, weekly series, untitled.
  assert.equal(countIcsEvents(sample), 7);
});

test("the e2e sample builder produces the expected anchor-relative events", () => {
  const parsed = parseIcs(buildOutlookSampleIcs({ anchor: new Date("2026-11-04T12:00:00Z") }));
  const events = expandIcsEvents(parsed, range("2026-10-26T00:00:00Z", "2026-11-30T00:00:00Z"));
  assert.deepEqual(
    events.map((event) => `${event.title}@${event.startWire}`),
    [
      "e2e-outlook-týdenní@2026-10-28T08:30:00",
      "e2e-outlook-porada@2026-11-04T10:00:00",
      "e2e-outlook-týdenní@2026-11-04T08:30:00",
      "e2e-outlook-celodenní@2026-11-05",
      "e2e-outlook-týdenní@2026-11-11T08:30:00",
      "e2e-outlook-týdenní@2026-11-18T08:30:00",
    ].sort((a, b) => a.split("@")[1].localeCompare(b.split("@")[1])),
  );
});
