import { Prisma } from "@/generated/prisma/client";

export const dateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Date-only fields (workDate, deadlines, …) are stored at UTC midnight
// (form.ts parses inputs as `${value}T00:00:00.000Z`). Formatting them in the
// server's local timezone can render the previous calendar day on UTC-negative
// hosts and disagree with the UTC filter bounds. This formatter pins to UTC so
// the rendered date always matches the stored date.
export const utcDateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export const dateTimeFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Prague",
});

export const numberFormatter = new Intl.NumberFormat("cs-CZ", {
  maximumFractionDigits: 2,
});

export const moneyFormatter = new Intl.NumberFormat("cs-CZ", {
  maximumFractionDigits: 2,
  style: "currency",
  currency: "CZK",
});

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }

  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }

  return dateTimeFormatter.format(new Date(value));
}

// Use for date-only fields so the calendar date is stable regardless of the
// server timezone (see utcDateFormatter).
export function formatDateUtc(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }

  return utcDateFormatter.format(new Date(value));
}

export function formatCaseLabel(
  legalCase: { name: string; fileNumber?: string | null } | null | undefined,
  fallback = "—",
) {
  if (!legalCase) {
    return fallback;
  }

  return `${legalCase.name}${
    legalCase.fileNumber ? `, ${legalCase.fileNumber}` : ""
  }`;
}

export function formatHours(value: Prisma.Decimal | number | string | null | undefined) {
  if (!value) {
    return "0";
  }

  return numberFormatter.format(Number(value));
}

export function formatMoney(
  value: Prisma.Decimal | number | string | null | undefined,
) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return moneyFormatter.format(Number(value));
}
