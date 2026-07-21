// Pure deadline math for Czech procedural deadlines. Dependency-free and
// DB-free so it's unit-testable (see deadlines.test.ts) — this is a
// risk-of-missed-deadline path, so it carries a check.
//
// ponytail: the "advisory" computation only. The engine is correct; the LEGAL
// question of which offset/calendar a given procedure uses lives in editable
// DeadlineRule rows an advokát must confirm — we never hardcode "the law".

export type DeadlineCalendar = "CALENDAR_DAYS" | "BUSINESS_DAYS";

export type DeadlineRuleInput = {
  offsetDays: number;
  calendar: DeadlineCalendar;
  rollForward: boolean; // only meaningful for CALENDAR_DAYS
};

// Czech public holidays (státní + ostatní svátky) — all are non-working days.
// Movable ones (Good Friday, Easter Monday) are computed from Easter Sunday.
// ponytail: hardcoded fixed list + computed Easter; if the holiday law changes,
// edit here. Source to verify with counsel: zákon č. 245/2000 Sb.
const FIXED_HOLIDAYS: ReadonlyArray<[month: number, day: number]> = [
  [1, 1],
  [5, 1],
  [5, 8],
  [7, 5],
  [7, 6],
  [9, 28],
  [10, 28],
  [11, 17],
  [12, 24],
  [12, 25],
  [12, 26],
];

// Anonymous Gregorian (Meeus/Jones/Butcher) algorithm — returns Easter Sunday
// (UTC) for the given year.
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function ymd(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

// Cache the holiday set per year so repeated checks in a loop stay cheap.
const holidayCache = new Map<number, Set<string>>();

function holidaysForYear(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const set = new Set<string>();
  for (const [month, day] of FIXED_HOLIDAYS) {
    set.add(ymd(new Date(Date.UTC(year, month - 1, day))));
  }
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  const easterMonday = new Date(easter);
  easterMonday.setUTCDate(easterMonday.getUTCDate() + 1);
  set.add(ymd(goodFriday));
  set.add(ymd(easterMonday));
  holidayCache.set(year, set);
  return set;
}

export function isCzechHoliday(date: Date): boolean {
  return holidaysForYear(date.getUTCFullYear()).has(ymd(date));
}

export function isBusinessDay(date: Date): boolean {
  const dow = date.getUTCDay(); // 0=Sun, 6=Sat
  return dow !== 0 && dow !== 6 && !isCzechHoliday(date);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// Compute an ADVISORY procedural deadline from a trigger date (e.g. the day a
// judgment was served) and a rule. The user may always override the result.
export function computeDeadline(
  triggerDate: Date,
  rule: DeadlineRuleInput,
): Date {
  let d = startOfUtcDay(triggerDate);
  if (rule.calendar === "BUSINESS_DAYS") {
    let remaining = Math.max(0, Math.trunc(rule.offsetDays));
    while (remaining > 0) {
      d = addDays(d, 1);
      if (isBusinessDay(d)) remaining -= 1;
    }
    return d;
  }
  // CALENDAR_DAYS
  d = addDays(d, Math.trunc(rule.offsetDays));
  if (rule.rollForward) {
    while (!isBusinessDay(d)) d = addDays(d, 1);
  }
  return d;
}
