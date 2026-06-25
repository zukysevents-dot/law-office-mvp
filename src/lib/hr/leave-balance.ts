// Pure leave-balance math (F7 / HR-6). No DB, no clock — unit-testable. The DB
// holds usedHours as the single source of truth; remaining is always derived
// here so it can't drift. The server action calls these inside a FOR UPDATE
// transaction on HrLeaveBalance.

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// remaining = entitlement + carryover - used. May be passed Decimals as numbers.
export function computeRemainingHours(
  entitlementHours: number,
  carryoverHours: number,
  usedHours: number,
): number {
  return round2(entitlementHours + carryoverHours - usedHours);
}

export function hoursToDays(hours: number, dailyHours: number): number {
  if (dailyHours <= 0) {
    return 0;
  }
  return round2(hours / dailyHours);
}

export function daysToHours(days: number, dailyHours: number): number {
  return round2(days * dailyHours);
}

// Throws when a requested absence would push the balance negative — the guard
// against over-drawing vacation. Caller runs this under the row lock.
export function assertNoOverdraw(remaining: number, requested: number): void {
  if (requested > remaining) {
    throw new Error(
      "Nedostatek zůstatku dovolené pro tuto žádost.",
    );
  }
}
