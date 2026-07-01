// Pure registry-monitoring logic: compare a subject's stored registry status
// against a freshly fetched ARES result and decide whether (and what) changed.
// No DB / network import — the runner in `registry/registry-monitor-service.ts`
// feeds it and persists the outcome. Fully unit-testable.

import type { AresSubjectFields, RegistryRiskSignalType } from "@/lib/ares/mapper";

// Mirrors the Prisma enum RegistryChangeType.
export type RegistryChangeKind =
  | "INSOLVENCY"
  | "DISSOLVED"
  | "LIQUIDATION"
  | "RISK_CLEARED"
  | "OTHER";

export type RegistryChange = {
  changeType: RegistryChangeKind;
  summary: string;
  oldValue: string | null;
  newValue: string | null;
  // Whether this change should RAISE the subject's risk flag. Monitoring only
  // ever escalates automatically; de-escalation (RISK_CLEARED) is left to the
  // lawyer, so this is false there.
  raisesRisk: boolean;
};

// Severity order → the most serious current signal classifies the change.
const SIGNAL_PRIORITY: RegistryRiskSignalType[] = [
  "INSOLVENCY",
  "DISSOLVED",
  "LIQUIDATION",
];

function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Decide whether the registry status changed. Returns null when nothing changed
 * (same composed status string). A newly-appeared/worsened risk yields an
 * escalating change (raisesRisk=true); a risk that fully cleared yields a
 * RISK_CLEARED change (raisesRisk=false).
 */
export function diffRegistryStatus(
  oldStatus: string | null | undefined,
  next: Pick<
    AresSubjectFields,
    "insolvencyStatus" | "riskSignals" | "riskDataPresent"
  >,
): RegistryChange | null {
  const oldValue = normalize(oldStatus);
  const newValue = normalize(next.insolvencyStatus);

  if (oldValue === newValue) {
    return null;
  }

  if (next.riskSignals.length > 0) {
    const types = new Set(next.riskSignals.map((signal) => signal.type));
    const changeType =
      SIGNAL_PRIORITY.find((type) => types.has(type)) ?? "OTHER";
    return {
      changeType,
      summary: newValue ?? "Zjištěna změna v rejstříku.",
      oldValue,
      newValue,
      raisesRisk: true,
    };
  }

  // Had a status before, now no risk signals. Only report the risk as cleared
  // when ARES actually returned the registration data — a partial payload
  // (missing seznamRegistraci) must NOT masquerade as "risk cleared".
  if (!next.riskDataPresent) {
    return null;
  }
  return {
    changeType: "RISK_CLEARED",
    summary: "Rizikový signál v rejstříku pominul.",
    oldValue,
    newValue: null,
    raisesRisk: false,
  };
}

// Notification type discriminator not needed here, but the recipient copy is
// shared, so build it centrally.
export function registryNotificationSubject(subjectName: string): string {
  return `Změna v rejstříku: ${subjectName}`;
}

export function registryNotificationBody(
  subjectName: string,
  change: RegistryChange,
): string {
  return [
    `U subjektu ${subjectName} byla zjištěna změna v rejstříku.`,
    "",
    change.summary,
  ].join("\n");
}
