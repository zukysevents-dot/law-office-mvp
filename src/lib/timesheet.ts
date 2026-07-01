// Pure helpers for the client-facing work timesheet (print → PDF). No DB /
// Prisma client import — structurally typed and unit-testable. The page builds
// the visibility-gated query; these only shape config + totals.

import type { Prisma } from "@/generated/prisma/client";

// Which work-logs a client timesheet lists.
//   billable — only billable work (what the client is charged for) — default
//   all      — every logged item in scope (incl. internal / non-billable)
export type TimesheetScope = "billable" | "all";

export function parseTimesheetScope(
  value: string | null | undefined,
): TimesheetScope {
  return value === "all" ? "all" : "billable";
}

// "1"/"true"/"on" → true. Used for the show-amounts toggle (server still gates
// it behind canViewRates, so a hand-edited URL can never reveal pricing).
export function parseBoolean(
  value: string | null | undefined,
  fallback = false,
): boolean {
  if (value == null || value === "") {
    return fallback;
  }
  return value === "1" || value === "true" || value === "on";
}

/**
 * Whether the timesheet may show rates/amounts. Fail-closed invariant: the
 * `amounts` URL toggle can only HIDE pricing, never reveal it — a role without
 * canViewRates always gets false regardless of the request.
 */
export function resolveShowAmounts(
  canViewRates: boolean,
  amountsRequested: boolean,
): boolean {
  return canViewRates && amountsRequested;
}

type TimesheetRow = {
  hours: Prisma.Decimal | number | string | null;
  amountCzk: Prisma.Decimal | number | string | null;
};

export type TimesheetTotals = {
  count: number;
  totalHours: number;
  totalAmountCzk: number;
};

function toNumber(value: TimesheetRow["hours"]): number {
  if (value == null) {
    return 0;
  }
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

/** Sum hours and amounts across the listed work-logs. Pure. */
export function computeTimesheetTotals(rows: TimesheetRow[]): TimesheetTotals {
  let totalHours = 0;
  let totalAmountCzk = 0;
  for (const row of rows) {
    totalHours += toNumber(row.hours);
    totalAmountCzk += toNumber(row.amountCzk);
  }
  // Guard accumulated float drift on the money total (2 decimals is canonical).
  totalAmountCzk = Math.round(totalAmountCzk * 100) / 100;
  return { count: rows.length, totalHours, totalAmountCzk };
}
