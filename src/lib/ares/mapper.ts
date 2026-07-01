/**
 * Map a raw ARES record to the `Subject` fields we store, and derive a risk
 * verdict from structured registry signals (not just name matching).
 */

import type { AresRawSubject } from "@/lib/ares/client";
import { legalFormLabel } from "@/lib/ares/legal-forms";
import { formatDateUtc } from "@/lib/format";

// Structured registry risk signal (drives both the composed warning string and
// the registry-monitoring change classification).
export type RegistryRiskSignalType = "INSOLVENCY" | "DISSOLVED" | "LIQUIDATION";
export type RegistryRiskSignal = { type: RegistryRiskSignalType; label: string };

export type AresSubjectFields = {
  name: string;
  dic: string | null;
  address: string | null;
  legalForm: string | null;
  /** Composed Czech warning string, or null when no risk signal is present. */
  insolvencyStatus: string | null;
  riskFlag: boolean;
  /** The individual signals behind `insolvencyStatus` (empty when no risk). */
  riskSignals: RegistryRiskSignal[];
  /**
   * Whether ARES actually returned the registration list (`seznamRegistraci`).
   * Distinguishes "confirmed clean" from "ARES omitted the data" so monitoring
   * never reports a false "risk cleared" on a partial payload.
   */
  riskDataPresent: boolean;
};

export function mapAresToSubjectFields(raw: AresRawSubject): AresSubjectFields {
  const name = raw.obchodniJmeno?.trim() ?? "";
  const dic = raw.dic?.trim() || null;
  const address = raw.sidlo?.textovaAdresa?.trim() || null;
  const legalForm = raw.pravniForma ? legalFormLabel(raw.pravniForma) : null;

  // Risk signals, strongest (structured) first; substring match is a fallback.
  const riskSignals: RegistryRiskSignal[] = [];

  if (raw.datumZaniku) {
    riskSignals.push({
      type: "DISSOLVED",
      label: `Subjekt zanikl (k ${formatDateUtc(raw.datumZaniku)})`,
    });
  }
  if (raw.seznamRegistraci?.stavZdrojeIr === "AKTIVNI") {
    riskSignals.push({
      type: "INSOLVENCY",
      label: "Aktivní záznam v insolvenčním rejstříku",
    });
  }
  if (/v likvidaci/i.test(name)) {
    riskSignals.push({ type: "LIQUIDATION", label: "V likvidaci" });
  }

  return {
    name,
    dic,
    address,
    legalForm,
    insolvencyStatus:
      riskSignals.length > 0
        ? riskSignals.map((signal) => signal.label).join("; ")
        : null,
    riskFlag: riskSignals.length > 0,
    riskSignals,
    riskDataPresent: raw.seznamRegistraci != null,
  };
}
