// Outlook-style ICS fixtures (as published by Outlook.com / Microsoft 365:
// Windows TZIDs, a VTIMEZONE block, CRLF line endings, folded long lines).
// Test-only — used by the unit tests and the e2e suite, never by app code.

const CRLF = "\r\n";

export const CENTRAL_EUROPE_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Central Europe Standard Time",
  "BEGIN:STANDARD",
  "DTSTART:16010101T030000",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:16010101T020000",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
];

/** Fold a content line at 75 octets like Outlook does (CRLF + space). */
function fold(line: string): string {
  if (line.length <= 75) {
    return line;
  }
  const parts = [line.slice(0, 75)];
  for (let index = 75; index < line.length; index += 74) {
    parts.push(` ${line.slice(index, index + 74)}`);
  }
  return parts.join(CRLF);
}

export function wrapCalendar(
  events: string[][],
  { withTimezone = true }: { withTimezone?: boolean } = {},
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "METHOD:PUBLISH",
    "PRODID:Microsoft Exchange Server 2010",
    "VERSION:2.0",
    "X-WR-CALNAME:Kalendář",
    ...(withTimezone ? CENTRAL_EUROPE_VTIMEZONE : []),
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

export function vevent(fields: string[]): string[] {
  return [
    "BEGIN:VEVENT",
    "CLASS:PUBLIC",
    "PRIORITY:5",
    "DTSTAMP:20261020T080000Z",
    "TRANSP:OPAQUE",
    "SEQUENCE:0",
    ...fields,
    "END:VEVENT",
  ];
}

const TZ = "TZID=Central Europe Standard Time";

/** Static sample for the unit tests (dates around the 25 Oct 2026 DST end). */
export const OUTLOOK_SAMPLE_ICS = wrapCalendar([
  // Single timed event, Tue 27 Oct 2026 10:00–11:00 Prague (CET).
  vevent([
    "UID:040000008200E00074C5B7101A82E00800000000single",
    "SUMMARY:Porada s klientem",
    `DTSTART;${TZ}:20261027T100000`,
    `DTEND;${TZ}:20261027T110000`,
    "LOCATION:Zasedačka 2",
    `DESCRIPTION:${"Velmi dlouhý popis události, který Outlook zalomí na více řádků. ".repeat(3)}`,
    "STATUS:CONFIRMED",
  ]),
  // UTC event 28 Oct 2026 13:00Z = 14:00 Prague.
  vevent([
    "UID:utc-event",
    "SUMMARY:Hovor (UTC)",
    "DTSTART:20261028T130000Z",
    "DTEND:20261028T133000Z",
  ]),
  // Floating time (no TZID) → treated as Prague.
  vevent([
    "UID:floating-event",
    "SUMMARY:Plovoucí čas",
    "DTSTART:20261029T090000",
    "DTEND:20261029T093000",
  ]),
  // All-day single (DTEND exclusive).
  vevent([
    "UID:all-day-single",
    "SUMMARY:Státní svátek",
    "DTSTART;VALUE=DATE:20261028",
    "DTEND;VALUE=DATE:20261029",
    "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE",
  ]),
  // All-day multi-day: 2.–4. 11. 2026 (DTEND 5. 11. exclusive).
  vevent([
    "UID:all-day-multi",
    "SUMMARY:Dovolená",
    "DTSTART;VALUE=DATE:20261102",
    "DTEND;VALUE=DATE:20261105",
  ]),
  // Weekly Tuesday 10:00 from 13 Oct (CEST) — 6 occurrences, crossing DST.
  // 3 Nov excluded (EXDATE); 10 Nov moved to Wed 11 Nov 14:00 (RECURRENCE-ID).
  vevent([
    "UID:weekly-series",
    "SUMMARY:Týdenní porada",
    `DTSTART;${TZ}:20261013T100000`,
    `DTEND;${TZ}:20261013T103000`,
    "RRULE:FREQ=WEEKLY;COUNT=6;INTERVAL=1;BYDAY=TU;WKST=MO",
    `EXDATE;${TZ}:20261103T100000`,
  ]),
  vevent([
    "UID:weekly-series",
    `RECURRENCE-ID;${TZ}:20261110T100000`,
    "SUMMARY:Týdenní porada (přesunuto)",
    `DTSTART;${TZ}:20261111T140000`,
    `DTEND;${TZ}:20261111T143000`,
  ]),
  // Cancelled event — must never show.
  vevent([
    "UID:cancelled-event",
    "SUMMARY:Zrušená schůzka",
    `DTSTART;${TZ}:20261027T150000`,
    `DTEND;${TZ}:20261027T160000`,
    "STATUS:CANCELLED",
  ]),
  // No SUMMARY.
  vevent([
    "UID:untitled-event",
    `DTSTART;${TZ}:20261030T080000`,
    `DTEND;${TZ}:20261030T083000`,
  ]),
]);

/** Same single event, but the feed has NO VTIMEZONE block (Windows name only). */
export const OUTLOOK_NO_VTIMEZONE_ICS = wrapCalendar(
  [
    vevent([
      "UID:no-vtimezone",
      "SUMMARY:Bez VTIMEZONE",
      `DTSTART;${TZ}:20260329T090000`,
      `DTEND;${TZ}:20260329T100000`,
    ]),
  ],
  { withTimezone: false },
);

/** Feed with a custom (unmapped) TZID defined only by its VTIMEZONE. */
export const CUSTOM_VTIMEZONE_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:test",
  "BEGIN:VTIMEZONE",
  "TZID:Customized Time Zone",
  "BEGIN:STANDARD",
  "DTSTART:16010101T000000",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0300",
  "END:STANDARD",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  "UID:custom-zone",
  "DTSTAMP:20261020T080000Z",
  "SUMMARY:Vlastní zóna",
  "DTSTART;TZID=Customized Time Zone:20261027T120000",
  "DTEND;TZID=Customized Time Zone:20261027T130000",
  "END:VEVENT",
  "END:VCALENDAR",
].join(CRLF);

function compact(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Feed relative to `anchor` (a date; only its UTC Y-M-D is used) for the e2e
 * suite: a 10:00–11:00 meeting on the anchor day, a weekly 08:30 series
 * (anchor −7 d, 4 occurrences) and an all-day event on anchor +1 d.
 */
export function buildOutlookSampleIcs({
  anchor,
  prefix = "e2e-outlook",
}: {
  anchor: Date;
  prefix?: string;
}): string {
  const day = compact(anchor);
  const seriesStart = compact(addDays(anchor, -7));
  return wrapCalendar([
    vevent([
      `UID:${prefix}-meeting`,
      `SUMMARY:${prefix}-porada`,
      `DTSTART;${TZ}:${day}T100000`,
      `DTEND;${TZ}:${day}T110000`,
      "LOCATION:Zasedačka",
    ]),
    vevent([
      `UID:${prefix}-weekly`,
      `SUMMARY:${prefix}-týdenní`,
      `DTSTART;${TZ}:${seriesStart}T083000`,
      `DTEND;${TZ}:${seriesStart}T090000`,
      "RRULE:FREQ=WEEKLY;COUNT=4",
    ]),
    vevent([
      `UID:${prefix}-all-day`,
      `SUMMARY:${prefix}-celodenní`,
      `DTSTART;VALUE=DATE:${compact(addDays(anchor, 1))}`,
      `DTEND;VALUE=DATE:${compact(addDays(anchor, 2))}`,
    ]),
  ]);
}
