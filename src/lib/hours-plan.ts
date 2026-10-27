// Výpočty pro plán vykázaných hodin (UserHoursPlan): „% plnění" na výkazech,
// KPI celkem i fakturovatelné, cíle pro období a koše pro graf na dashboardu
// a stránce Výkonnost. Čistá logika bez DB/Prisma,
// aby šla testovat samostatně.

import { officeWorkDate } from "@/lib/hr/attendance-calc";

export const DAY_MS = 24 * 60 * 60 * 1000;

// Po–Ne; index odpovídá dni v týdnu počítanému od pondělí.
export const WEEKDAY_LABELS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"] as const;

export type DayBucket = {
  label: string;
  date: Date;
  hours: number;
};

// Procento naplnění cíle. Cíl je null/0, dokud ho admin nenastaví — pak vrací
// null (% se nezobrazuje). Jinak zaokrouhlené procento odpracovaných hodin.
export function fulfillmentPercent(
  actualHours: number,
  targetHours: number | null | undefined,
): number | null {
  if (
    targetHours == null ||
    !Number.isFinite(targetHours) ||
    targetHours <= 0
  ) {
    return null;
  }

  return Math.round((actualHours / targetHours) * 100);
}

// Začátek aktuálního týdne (pondělí 00:00 UTC) v milisekundách. workDate se
// ukládá na UTC půlnoc, takže hranice i bucketování počítáme v UTC, aby úkon
// nespadl do vedlejšího dne kvůli časovému posunu.
export function weekStartUtcMs(now: Date): number {
  const weekday = (now.getUTCDay() + 6) % 7; // pondělí = 0
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - weekday,
  );
}

// Sedm košů (Po–Ne) se součtem odpracovaných hodin pro daný týden. Každý
// workDate leží přesně na UTC půlnoci, takže index dne = celé dny od začátku
// týdne. Úkony mimo týden se ignorují.
export function weeklyHoursBuckets(
  weekStartMs: number,
  entries: Array<{ workDate: Date; hours: number }>,
): DayBucket[] {
  const buckets: DayBucket[] = WEEKDAY_LABELS.map((label, index) => ({
    label,
    date: new Date(weekStartMs + index * DAY_MS),
    hours: 0,
  }));

  for (const entry of entries) {
    const index = Math.floor(
      (entry.workDate.getTime() - weekStartMs) / DAY_MS,
    );
    if (index >= 0 && index < buckets.length) {
      // Hodiny by neměly být záporné (vstup má min 0), ale defenzivně ořízneme,
      // ať graf nikdy nedostane zápornou výšku sloupce.
      buckets[index].hours += Math.max(0, entry.hours);
    }
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// KPI: cíle celkem i fakturovatelné (balík 08)
// ---------------------------------------------------------------------------

export const MAX_WEEKLY_HOURS_TARGET = 168;
export const MAX_MONTHLY_HOURS_TARGET = 744;

// Čtyři cíle plánu hodin. null = nenastaveno (% plnění se nepočítá).
export type HoursPlanTargets = {
  weeklyTotal: number | null;
  weeklyBillable: number | null;
  monthlyTotal: number | null;
  monthlyBillable: number | null;
};

export const EMPTY_HOURS_PLAN: HoursPlanTargets = {
  weeklyTotal: null,
  weeklyBillable: null,
  monthlyTotal: null,
  monthlyBillable: null,
};

type DecimalLike = { toString(): string } | number | string | null | undefined;

function decimalToNumber(value: DecimalLike): number | null {
  if (value == null) {
    return null;
  }
  const number = typeof value === "number" ? value : Number(value.toString());
  return sanitizeHoursTarget(number);
}

// Řádek UserHoursPlan (Decimal) → čísla. Bez plánu → EMPTY_HOURS_PLAN.
export function hoursPlanFromRecord(
  record:
    | {
        weeklyHoursTarget?: DecimalLike;
        monthlyHoursTarget?: DecimalLike;
        weeklyBillableHoursTarget?: DecimalLike;
        monthlyBillableHoursTarget?: DecimalLike;
      }
    | null
    | undefined,
): HoursPlanTargets {
  if (!record) {
    return { ...EMPTY_HOURS_PLAN };
  }
  return {
    weeklyTotal: decimalToNumber(record.weeklyHoursTarget),
    weeklyBillable: decimalToNumber(record.weeklyBillableHoursTarget),
    monthlyTotal: decimalToNumber(record.monthlyHoursTarget),
    monthlyBillable: decimalToNumber(record.monthlyBillableHoursTarget),
  };
}

export function hasAnyHoursTarget(plan: HoursPlanTargets): boolean {
  return (
    plan.weeklyTotal != null ||
    plan.weeklyBillable != null ||
    plan.monthlyTotal != null ||
    plan.monthlyBillable != null
  );
}

// Kladné hodiny, jinak null. Prázdné pole i zadaná 0 ruší cíl — ukládá se
// jediná reprezentace „bez cíle" (NULL), konzistentně s fulfillmentPercent,
// které cíl <= 0 bere jako nenastavený.
export function sanitizeHoursTarget(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

// Česká validační hláška, nebo null když je plán v pořádku.
export function validateHoursPlan(plan: HoursPlanTargets): string | null {
  for (const value of [plan.weeklyTotal, plan.weeklyBillable]) {
    if (value != null && value > MAX_WEEKLY_HOURS_TARGET) {
      return `Týdenní cíl může být nejvýše ${MAX_WEEKLY_HOURS_TARGET} h.`;
    }
  }
  for (const value of [plan.monthlyTotal, plan.monthlyBillable]) {
    if (value != null && value > MAX_MONTHLY_HOURS_TARGET) {
      return `Měsíční cíl může být nejvýše ${MAX_MONTHLY_HOURS_TARGET} h.`;
    }
  }
  if (
    (plan.weeklyTotal != null &&
      plan.weeklyBillable != null &&
      plan.weeklyBillable > plan.weeklyTotal) ||
    (plan.monthlyTotal != null &&
      plan.monthlyBillable != null &&
      plan.monthlyBillable > plan.monthlyTotal)
  ) {
    return "Cíl fakturovatelných hodin nemůže být vyšší než cíl hodin celkem.";
  }
  return null;
}

// Fakturovatelné hodiny pro KPI = výkaz označený jako fakturovatelný (BILLABLE,
// legacy NEEDS_APPROVAL), včetně čekajících na schválení; zamítnuté ne. Odpisy
// a interní práce jsou nefakturovatelné. Fakturace/billability report mají
// vlastní (přísnější) pravidla — toto je jen měřítko výkonu.
export function isBillableKpiHours(
  billingStatus: string,
  approvalStatus: string,
): boolean {
  return (
    (billingStatus === "BILLABLE" || billingStatus === "NEEDS_APPROVAL") &&
    approvalStatus !== "REJECTED"
  );
}

// Začátek týdne podle kancelářského dne (Europe/Prague). V pondělí 0:30
// pražského času je v UTC ještě neděle — weekStartUtcMs(now) by vrátil minulý
// týden. workDate je UTC půlnoc kancelářského dne, proto nejdřív officeWorkDate.
export function officeWeekStartUtcMs(now: Date): number {
  return weekStartUtcMs(officeWorkDate(now));
}

function isWeekdayUtc(ms: number): boolean {
  const day = new Date(ms).getUTCDay();
  return day !== 0 && day !== 6;
}

// Počet pracovních dnů (Po–Pá) v [fromMs, toExclusiveMs) po UTC dnech.
// Státní svátky se neodečítají (aplikace nemá kalendář svátků).
export function workingDaysBetween(fromMs: number, toExclusiveMs: number): number {
  let count = 0;
  for (let day = fromMs; day < toExclusiveMs; day += DAY_MS) {
    if (isWeekdayUtc(day)) {
      count += 1;
    }
  }
  return count;
}

function monthStartUtc(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function addMonthsUtc(ms: number, months: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}

function isFullWeek(fromMs: number, toExclusiveMs: number) {
  return weekStartUtcMs(new Date(fromMs)) === fromMs && toExclusiveMs - fromMs === 7 * DAY_MS;
}

function isFullMonth(fromMs: number, toExclusiveMs: number) {
  return monthStartUtc(fromMs) === fromMs && addMonthsUtc(fromMs, 1) === toExclusiveMs;
}

function isFullQuarter(fromMs: number, toExclusiveMs: number) {
  return (
    monthStartUtc(fromMs) === fromMs &&
    new Date(fromMs).getUTCMonth() % 3 === 0 &&
    addMonthsUtc(fromMs, 3) === toExclusiveMs
  );
}

export type TargetPreference = "weekly" | "monthly";

// Krátké úseky (≤ 7 dnů) se rozpočítávají z týdenního cíle, delší z měsíčního
// (je-li nastavený) — aby denní značky v týdnu dávaly dohromady týdenní cíl a
// týdenní úseky v měsíci dávaly dohromady měsíční cíl.
export function defaultTargetPreference(
  fromMs: number,
  toExclusiveMs: number,
): TargetPreference {
  return toExclusiveMs - fromMs <= 7 * DAY_MS ? "weekly" : "monthly";
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function targetForRange(
  weekly: number | null,
  monthly: number | null,
  fromMs: number,
  toExclusiveMs: number,
  prefer: TargetPreference,
): number | null {
  if (weekly == null && monthly == null) {
    return null;
  }
  if (toExclusiveMs <= fromMs) {
    return 0;
  }
  if (weekly != null && prefer === "weekly" && isFullWeek(fromMs, toExclusiveMs)) {
    return weekly;
  }
  if (monthly != null && isFullMonth(fromMs, toExclusiveMs)) {
    return monthly;
  }
  if (monthly != null && isFullQuarter(fromMs, toExclusiveMs)) {
    return round2(monthly * 3);
  }

  const useWeekly = weekly != null && (prefer === "weekly" || monthly == null);
  const workingDaysInMonth = new Map<number, number>();
  let sum = 0;
  for (let day = fromMs; day < toExclusiveMs; day += DAY_MS) {
    if (!isWeekdayUtc(day)) {
      continue;
    }
    if (useWeekly) {
      sum += (weekly as number) / 5;
      continue;
    }
    const monthStart = monthStartUtc(day);
    let days = workingDaysInMonth.get(monthStart);
    if (days === undefined) {
      days = workingDaysBetween(monthStart, addMonthsUtc(monthStart, 1));
      workingDaysInMonth.set(monthStart, days);
    }
    sum += (monthly as number) / days;
  }
  return round2(sum);
}

export type PeriodTargets = { total: number | null; billable: number | null };

// Cíl hodin (celkem a fakturovatelných, nezávisle) pro období [from, toExcl):
// celý týden → týdenní cíl, celý měsíc → měsíční, kvartál → 3× měsíční, jinak
// poměrem podle pracovních dnů. Nic nenastaveno → null.
export function periodTargets(
  plan: HoursPlanTargets,
  fromMs: number,
  toExclusiveMs: number,
  prefer: TargetPreference = defaultTargetPreference(fromMs, toExclusiveMs),
): PeriodTargets {
  return {
    total: targetForRange(plan.weeklyTotal, plan.monthlyTotal, fromMs, toExclusiveMs, prefer),
    billable: targetForRange(
      plan.weeklyBillable,
      plan.monthlyBillable,
      fromMs,
      toExclusiveMs,
      prefer,
    ),
  };
}

// --- Buckety pro sloupcový graf KPI -----------------------------------------

export type KpiEntry = { workDate: Date; hours: number; billable: boolean };

export type HoursKpiBucket = {
  key: string;
  label: string; // „Po 26. 10." / „5.–11. 10."
  shortLabel: string; // „Po" / „5.–11."
  fromMs: number;
  toMs: number; // exkluzivně
  total: number;
  billable: number;
  totalTarget: number | null;
  billableTarget: number | null;
  current: boolean;
};

function dayMonth(ms: number) {
  const date = new Date(ms);
  return `${date.getUTCDate()}. ${date.getUTCMonth() + 1}.`;
}

function weekdayLabel(ms: number) {
  return WEEKDAY_LABELS[(new Date(ms).getUTCDay() + 6) % 7];
}

function rangeLabel(fromMs: number, toExclusiveMs: number) {
  const last = toExclusiveMs - DAY_MS;
  if (last <= fromMs) {
    return dayMonth(fromMs);
  }
  const from = new Date(fromMs);
  const to = new Date(last);
  if (from.getUTCMonth() === to.getUTCMonth()) {
    return `${from.getUTCDate()}.–${to.getUTCDate()}. ${to.getUTCMonth() + 1}.`;
  }
  return `${dayMonth(fromMs)}–${dayMonth(last)}`;
}

function fillBuckets(
  ranges: Array<{ fromMs: number; toMs: number; label: string; shortLabel: string }>,
  entries: KpiEntry[],
  plan: HoursPlanTargets,
  prefer: TargetPreference,
  todayMs: number | null,
): HoursKpiBucket[] {
  const buckets = ranges.map((range) => {
    const targets = periodTargets(plan, range.fromMs, range.toMs, prefer);
    return {
      key: new Date(range.fromMs).toISOString().slice(0, 10),
      label: range.label,
      shortLabel: range.shortLabel,
      fromMs: range.fromMs,
      toMs: range.toMs,
      total: 0,
      billable: 0,
      totalTarget: targets.total,
      billableTarget: targets.billable,
      current: todayMs != null && todayMs >= range.fromMs && todayMs < range.toMs,
    } satisfies HoursKpiBucket;
  });

  for (const entry of entries) {
    const time = entry.workDate.getTime();
    const bucket = buckets.find((item) => time >= item.fromMs && time < item.toMs);
    if (!bucket) {
      continue;
    }
    const hours = Math.max(0, entry.hours);
    bucket.total += hours;
    if (entry.billable) {
      bucket.billable += hours;
    }
  }

  for (const bucket of buckets) {
    bucket.total = round2(bucket.total);
    bucket.billable = round2(bucket.billable);
  }
  return buckets;
}

// Denní sloupce pro [fromMs, toExclusiveMs) (dashboard: týden Po–Ne). Cíl dne
// = podíl týdenního (resp. měsíčního) cíle na pracovní den, o víkendu 0.
export function dailyKpiBuckets(
  fromMs: number,
  toExclusiveMs: number,
  entries: KpiEntry[],
  plan: HoursPlanTargets,
  options: { todayMs?: number | null; prefer?: TargetPreference } = {},
): HoursKpiBucket[] {
  const prefer = options.prefer ?? defaultTargetPreference(fromMs, toExclusiveMs);
  const ranges = [];
  for (let day = fromMs; day < toExclusiveMs; day += DAY_MS) {
    ranges.push({
      fromMs: day,
      toMs: day + DAY_MS,
      label: `${weekdayLabel(day)} ${dayMonth(day)}`,
      shortLabel: weekdayLabel(day),
    });
  }
  return fillBuckets(ranges, entries, plan, prefer, options.todayMs ?? null);
}

// Týdenní sloupce (Po–Ne) ořezané na [fromMs, toExclusiveMs) — dashboard
// (aktuální měsíc) a detail osoby (delší období).
export function weeklyKpiBuckets(
  fromMs: number,
  toExclusiveMs: number,
  entries: KpiEntry[],
  plan: HoursPlanTargets,
  options: { todayMs?: number | null; prefer?: TargetPreference } = {},
): HoursKpiBucket[] {
  const prefer = options.prefer ?? defaultTargetPreference(fromMs, toExclusiveMs);
  const ranges = [];
  let cursor = fromMs;
  while (cursor < toExclusiveMs) {
    const nextWeek = weekStartUtcMs(new Date(cursor)) + 7 * DAY_MS;
    const end = Math.min(nextWeek, toExclusiveMs);
    const label = rangeLabel(cursor, end);
    const from = new Date(cursor);
    const last = new Date(end - DAY_MS);
    ranges.push({
      fromMs: cursor,
      toMs: end,
      label,
      shortLabel:
        end - cursor <= DAY_MS
          ? `${from.getUTCDate()}.`
          : `${from.getUTCDate()}.–${last.getUTCDate()}.`,
    });
    cursor = end;
  }
  return fillBuckets(ranges, entries, plan, prefer, options.todayMs ?? null);
}

// Součty přes buckety (souhrn nad grafem).
export function sumKpiBuckets(buckets: HoursKpiBucket[]) {
  return buckets.reduce(
    (acc, bucket) => ({
      total: round2(acc.total + bucket.total),
      billable: round2(acc.billable + bucket.billable),
    }),
    { total: 0, billable: 0 },
  );
}
