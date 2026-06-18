/**
 * Map a raw ARES record to the `Subject` fields we store, and derive a risk
 * verdict from structured registry signals (not just name matching).
 */

import type { AresRawSubject } from "@/lib/ares/client";
import { legalFormLabel } from "@/lib/ares/legal-forms";
import { formatDateUtc } from "@/lib/format";

export type AresSubjectFields = {
  name: string;
  dic: string | null;
  address: string | null;
  legalForm: string | null;
  /** Composed Czech warning string, or null when no risk signal is present. */
  insolvencyStatus: string | null;
  riskFlag: boolean;
};

export function mapAresToSubjectFields(raw: AresRawSubject): AresSubjectFields {
  const name = raw.obchodniJmeno?.trim() ?? "";
  const dic = raw.dic?.trim() || null;
  const address = raw.sidlo?.textovaAdresa?.trim() || null;
  const legalForm = raw.pravniForma ? legalFormLabel(raw.pravniForma) : null;

  // Risk signals, strongest (structured) first; substring match is a fallback.
  const risks: string[] = [];

  if (raw.datumZaniku) {
    risks.push(`Subjekt zanikl (k ${formatDateUtc(raw.datumZaniku)})`);
  }
  if (raw.seznamRegistraci?.stavZdrojeIr === "AKTIVNI") {
    risks.push("Aktivní záznam v insolvenčním rejstříku");
  }
  if (/v likvidaci/i.test(name)) {
    risks.push("V likvidaci");
  }

  return {
    name,
    dic,
    address,
    legalForm,
    insolvencyStatus: risks.length > 0 ? risks.join("; ") : null,
    riskFlag: risks.length > 0,
  };
}
