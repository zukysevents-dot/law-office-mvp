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
  // toFixed: 0.35 / 0.1 = 3.4999999999999996 by jinak spadlo dolů (0,3 h místo
  // 0,4 h) — poloviny kroku se zaokrouhlují nahoru stejně pro každou hodnotu.
  const rounded =
    Math.round(Number((hours / incrementHours).toFixed(9))) * incrementHours;

  return Number(Math.max(incrementHours, rounded).toFixed(2));
}

/** Krok zaokrouhlení v hodinách (0,1 h pro 6 minut, 0,25 h pro 15 minut). */
export function incrementHours(incrementMinutes: number | null | undefined): number {
  return normalizeBillingTimeIncrement(incrementMinutes) / 60;
}

// Hodiny jsou uložené na setiny (Decimal(8, 2)); násobky porovnáváme v setinách,
// aby 0.3 / 0.1 nespadlo na plovoucí čárce.
function isMultipleOf(hours: number, step: number) {
  const hundredths = Math.round(hours * 100);
  const stepHundredths = Math.round(step * 100);
  return (
    Math.abs(hours * 100 - hundredths) < 1e-6 && hundredths % stepHundredths === 0
  );
}

/**
 * Atribut `step` pro pole „Hodiny“. Odpovídá kroku kanceláře (0,1 / 0,25 h),
 * aby šipky i validace prohlížeče šly po nastaveném kroku. Pokud uložená
 * hodnota krokem není (výkaz z doby jiného nastavení, např. 1,25 h po
 * přepnutí na 0,1 h), použije se jemnější krok, se kterým je hodnota platná —
 * jinak by prohlížeč formulář s nezměněnou hodnotou vůbec neodeslal.
 */
export function hoursInputStep(
  incrementMinutes: number | null | undefined,
  currentHours?: number | null,
): string {
  const step = incrementHours(incrementMinutes);
  if (currentHours === null || currentHours === undefined || isMultipleOf(currentHours, step)) {
    return String(step);
  }
  return isMultipleOf(currentHours, 0.05) ? "0.05" : "0.01";
}

/**
 * Hodiny odeslané z formuláře úpravy / schválení: nezměněná uložená hodnota se
 * zachová (i když neodpovídá aktuálnímu kroku kanceláře — tichá změna při
 * opravě popisu by změnila fakturovanou částku), změněná se zaokrouhlí na krok.
 */
export function resolveSubmittedHours(
  submittedHours: number,
  storedHours: number | string | { toString(): string } | null | undefined,
  incrementMinutes: number,
): number {
  if (storedHours !== null && storedHours !== undefined) {
    const stored = Number(storedHours);
    if (Number.isFinite(stored) && Math.abs(stored - submittedHours) < 1e-9) {
      return stored;
    }
  }
  return roundHoursToIncrement(submittedHours, incrementMinutes);
}
