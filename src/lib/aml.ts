import { AmlRiskLevel } from "@/generated/prisma/enums";

// A subject is flagged risky when its current assessment is HIGH risk, or it is
// a politically exposed person, or a sanctions match was found. Pure + testable;
// drives Subject.riskFlag from assessRisk.
export function deriveRiskFlag(
  riskLevel: AmlRiskLevel,
  isPep: boolean,
  hasSanctions: boolean,
): boolean {
  return riskLevel === AmlRiskLevel.HIGH || isPep || hasSanctions;
}

// Display-safe mask of a document number: only the last 4 chars remain (short
// values keep just the last char). The full number lives encrypted at rest, so
// lists/detail never decrypt to render.
export function maskDocumentNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed.length <= 4) {
    return "•".repeat(trimmed.length - 1) + trimmed.slice(-1);
  }
  return `••••${trimmed.slice(-4)}`;
}

// Common Czech identification document types (stored as plain strings).
export const documentTypeOptions = [
  "Občanský průkaz",
  "Cestovní pas",
  "Řidičský průkaz",
  "Výpis z obchodního rejstříku",
  "Jiné",
];
