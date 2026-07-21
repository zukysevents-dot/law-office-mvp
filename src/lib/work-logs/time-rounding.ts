export const BILLING_TIME_INCREMENTS = [6, 15] as const;

export type BillingTimeIncrementMinutes =
  (typeof BILLING_TIME_INCREMENTS)[number];

export function normalizeBillingTimeIncrement(
  value: number | null | undefined,
): BillingTimeIncrementMinutes {
  return value === 6 ? 6 : 15;
}

export function roundHoursToIncrement(
  hours: number,
  incrementMinutes: number,
): number {
  const normalizedMinutes = normalizeBillingTimeIncrement(incrementMinutes);
  const incrementHours = normalizedMinutes / 60;
  const rounded = Math.round(hours / incrementHours) * incrementHours;

  return Number(Math.max(incrementHours, rounded).toFixed(2));
}
