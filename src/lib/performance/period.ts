// Období pro stránku Výkonnost (týden / měsíc / čtvrtletí / vlastní rozsah).
// Čistá logika bez DB a bez hodin: `today` je kancelářský den jako UTC půlnoc
// (officeWorkDate), všechny hranice jsou UTC půlnoci — stejně jako workDate.

import { DAY_MS, weekStartUtcMs } from "@/lib/hours-plan";

export const PERFORMANCE_PERIOD_KINDS = ["week", "month", "quarter", "custom"] as const;
export type PerformancePeriodKind = (typeof PERFORMANCE_PERIOD_KINDS)[number];

export const MAX_CUSTOM_PERIOD_DAYS = 366;

export const INVALID_PERIOD_REASONS = {
  missing: "vyplňte datum Od nebo Do",
  format: "datum Od nebo Do není platné",
  order: "datum Od je pozdější než Do",
  tooLong: `vlastní období může mít nejvýše ${MAX_CUSTOM_PERIOD_DAYS} dní`,
} as const;
export type InvalidPeriodReason = keyof typeof INVALID_PERIOD_REASONS;

// Hláška u neplatného vlastního období: proč je neplatné + co se zobrazilo.
export function invalidPeriodMessage(reason: InvalidPeriodReason) {
  return `Neplatné období – ${INVALID_PERIOD_REASONS[reason]}. Zobrazen aktuální měsíc.`;
}

const MONTH_NAMES = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
];

export type PerformancePeriodInput = {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  anchor?: string | null;
};

export type PerformancePeriod = {
  kind: PerformancePeriodKind;
  fromMs: number;
  toExclusiveMs: number;
  // Vstupy formuláře (Od/Do) a název exportu: YYYY-MM-DD, `to` včetně.
  fromIso: string;
  toIso: string;
  label: string;
  // Query parametry období (bez ostatních filtrů) pro odkazy.
  params: Record<string, string>;
  prevParams: Record<string, string>;
  nextParams: Record<string, string>;
  containsToday: boolean;
  error?: string;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// YYYY-MM-DD → UTC půlnoc, nebo null (špatný formát / neexistující datum).
export function parseIsoDate(value: string | null | undefined): number | null {
  const match = value ? ISO_DATE.exec(value.trim()) : null;
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function czDate(ms: number, withYear = true) {
  const date = new Date(ms);
  const base = `${date.getUTCDate()}. ${date.getUTCMonth() + 1}.`;
  return withYear ? `${base} ${date.getUTCFullYear()}` : base;
}

function rangeText(fromMs: number, toExclusiveMs: number) {
  const last = toExclusiveMs - DAY_MS;
  const sameYear = new Date(fromMs).getUTCFullYear() === new Date(last).getUTCFullYear();
  return `${czDate(fromMs, !sameYear)} – ${czDate(last)}`;
}

function monthStart(ms: number, offset = 0) {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1);
}

function quarterStart(ms: number, offsetQuarters = 0) {
  const date = new Date(ms);
  const month = Math.floor(date.getUTCMonth() / 3) * 3;
  return Date.UTC(date.getUTCFullYear(), month + offsetQuarters * 3, 1);
}

function build(
  kind: PerformancePeriodKind,
  fromMs: number,
  toExclusiveMs: number,
  todayMs: number,
  label: string,
  params: Record<string, string>,
  prevParams: Record<string, string>,
  nextParams: Record<string, string>,
  error?: string,
): PerformancePeriod {
  return {
    kind,
    fromMs,
    toExclusiveMs,
    fromIso: isoDate(fromMs),
    toIso: isoDate(toExclusiveMs - DAY_MS),
    label,
    params,
    prevParams,
    nextParams,
    containsToday: todayMs >= fromMs && todayMs < toExclusiveMs,
    ...(error ? { error } : {}),
  };
}

function anchoredParams(kind: PerformancePeriodKind, anchorMs: number, todayMs: number) {
  // Aktuální období se v URL neukotvuje (sdílený odkaz „tento měsíc“ zůstane
  // aktuální i příští měsíc).
  const params: Record<string, string> = { period: kind };
  const current =
    kind === "week"
      ? weekStartUtcMs(new Date(todayMs))
      : kind === "month"
        ? monthStart(todayMs)
        : quarterStart(todayMs);
  if (anchorMs !== current) {
    params.anchor = isoDate(anchorMs);
  }
  return params;
}

function resolveWeek(anchorMs: number, todayMs: number) {
  const from = weekStartUtcMs(new Date(anchorMs));
  const to = from + 7 * DAY_MS;
  return build(
    "week",
    from,
    to,
    todayMs,
    `Týden ${rangeText(from, to)}`,
    anchoredParams("week", from, todayMs),
    anchoredParams("week", from - 7 * DAY_MS, todayMs),
    anchoredParams("week", to, todayMs),
  );
}

function resolveMonth(anchorMs: number, todayMs: number, error?: string) {
  const from = monthStart(anchorMs);
  const to = monthStart(anchorMs, 1);
  const date = new Date(from);
  return build(
    "month",
    from,
    to,
    todayMs,
    `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()} (${rangeText(from, to)})`,
    anchoredParams("month", from, todayMs),
    anchoredParams("month", monthStart(from, -1), todayMs),
    anchoredParams("month", to, todayMs),
    error,
  );
}

function resolveQuarter(anchorMs: number, todayMs: number) {
  const from = quarterStart(anchorMs);
  const to = quarterStart(anchorMs, 1);
  const date = new Date(from);
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return build(
    "quarter",
    from,
    to,
    todayMs,
    `${quarter}. čtvrtletí ${date.getUTCFullYear()} (${rangeText(from, to)})`,
    anchoredParams("quarter", from, todayMs),
    anchoredParams("quarter", quarterStart(from, -1), todayMs),
    anchoredParams("quarter", to, todayMs),
  );
}

function customParams(fromMs: number, toExclusiveMs: number) {
  return { period: "custom", from: isoDate(fromMs), to: isoDate(toExclusiveMs - DAY_MS) };
}

// Období z query parametrů. Vyplněné Od/Do bez `period` = vlastní rozsah.
// Neplatný vlastní rozsah (formát, Od > Do, víc než 366 dnů) → aktuální měsíc
// s hláškou. Chybí-li jen „Do“, bere se dnešek (nebo „Od“, je-li v budoucnu);
// chybí-li jen „Od“, začátek měsíce data „Do“.
export function resolvePerformancePeriod(
  input: PerformancePeriodInput,
  today: Date,
): PerformancePeriod {
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const rawKind = input.period?.trim() ?? "";
  const hasRange = Boolean(input.from?.trim() || input.to?.trim());
  const kind: PerformancePeriodKind = (PERFORMANCE_PERIOD_KINDS as readonly string[]).includes(
    rawKind,
  )
    ? (rawKind as PerformancePeriodKind)
    : hasRange
      ? "custom"
      : "month";
  const anchorMs = parseIsoDate(input.anchor) ?? todayMs;

  if (kind === "week") {
    return resolveWeek(anchorMs, todayMs);
  }
  if (kind === "quarter") {
    return resolveQuarter(anchorMs, todayMs);
  }
  if (kind === "month") {
    return resolveMonth(anchorMs, todayMs);
  }

  const rawFrom = input.from?.trim() ?? "";
  const rawTo = input.to?.trim() ?? "";
  let fromMs = rawFrom ? parseIsoDate(rawFrom) : null;
  let toMs = rawTo ? parseIsoDate(rawTo) : null;
  if (!rawFrom && !rawTo) {
    return resolveMonth(todayMs, todayMs, invalidPeriodMessage("missing"));
  }
  if ((rawFrom && fromMs == null) || (rawTo && toMs == null)) {
    return resolveMonth(todayMs, todayMs, invalidPeriodMessage("format"));
  }
  if (fromMs == null && toMs != null) {
    fromMs = monthStart(toMs);
  }
  if (toMs == null && fromMs != null) {
    toMs = Math.max(fromMs, todayMs);
  }
  if (fromMs == null || toMs == null) {
    return resolveMonth(todayMs, todayMs, invalidPeriodMessage("missing"));
  }
  if (fromMs > toMs) {
    return resolveMonth(todayMs, todayMs, invalidPeriodMessage("order"));
  }
  if ((toMs - fromMs) / DAY_MS + 1 > MAX_CUSTOM_PERIOD_DAYS) {
    return resolveMonth(todayMs, todayMs, invalidPeriodMessage("tooLong"));
  }

  const toExclusive = toMs + DAY_MS;
  const length = toExclusive - fromMs;
  return build(
    "custom",
    fromMs,
    toExclusive,
    todayMs,
    rangeText(fromMs, toExclusive),
    customParams(fromMs, toExclusive),
    customParams(fromMs - length, fromMs),
    customParams(toExclusive, toExclusive + length),
  );
}
