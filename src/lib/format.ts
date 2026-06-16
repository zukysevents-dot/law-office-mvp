import { Prisma } from "@/generated/prisma/client";

export const dateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
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
