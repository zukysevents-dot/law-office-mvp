import type { badgeToneClasses } from "@/components/ui/badge";

type BadgeTone = keyof typeof badgeToneClasses;

export const invoiceStatusLabels = {
  DRAFT: "Koncept",
  ISSUED: "Vystaveno",
  PAID: "Zaplaceno",
  CANCELLED: "Storno",
} as const;

export function invoiceStatusTone(
  status: keyof typeof invoiceStatusLabels,
): BadgeTone {
  if (status === "PAID") return "green";
  if (status === "CANCELLED") return "red";
  if (status === "ISSUED") return "blue";
  return "neutral";
}
