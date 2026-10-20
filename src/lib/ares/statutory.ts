/**
 * Statutory bodies from the ARES public-register (VR) record. Defensive: the
 * VR payload is large and its shape may change — anything unexpected is
 * skipped, never thrown.
 */

import type { AresVrMember, AresVrRaw } from "@/lib/ares/client";
import { capitalizeName, composePersonName } from "@/lib/subjects/person-name";

export type AresStatutoryBody = {
  name: string;
  function: string | null;
  actingMethod: string | null;
  /** "YYYY-MM-DD" or null. */
  validFrom: string | null;
  /** IČO of a legal-person member (to suggest a link to an existing subject). */
  ico: string | null;
};

const str = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const day = (value: unknown) => {
  const text = str(value);
  return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

function lowerFirst(value: string | null) {
  return value ? value.charAt(0).toLocaleLowerCase("cs-CZ") + value.slice(1) : null;
}

function memberName(member: AresVrMember): { name: string; ico: string | null } | null {
  const person = member.fyzickaOsoba;
  if (person && (str(person.jmeno) || str(person.prijmeni))) {
    const name = composePersonName({
      titleBefore: str(person.titulPredJmenem),
      firstName: capitalizeName(str(person.jmeno)),
      lastName: capitalizeName(str(person.prijmeni)),
      titleAfter: str(person.titulZaJmenem),
    });
    return name ? { name, ico: null } : null;
  }
  const legal = member.pravnickaOsoba;
  const legalName = str(legal?.obchodniJmeno);
  if (legalName) {
    const ico = str(legal?.ico)?.replace(/\D/g, "") || null;
    return { name: legalName, ico: ico ? ico.padStart(8, "0") : null };
  }
  return null;
}

/** Current statutory bodies (members without `datumVymazu`) of the primary record. */
export function mapAresStatutoryBodies(raw: AresVrRaw | null | undefined): AresStatutoryBody[] {
  const records = Array.isArray(raw?.zaznamy) ? raw.zaznamy : [];
  const primary = records.find((record) => record?.primarniZaznam) ?? records[0];
  const organs = Array.isArray(primary?.statutarniOrgany) ? primary.statutarniOrgany : [];
  const out: AresStatutoryBody[] = [];
  const seen = new Set<string>();

  for (const organ of organs) {
    if (!organ || organ.datumVymazu) continue;
    const acting = Array.isArray(organ.zpusobJednani)
      ? str(organ.zpusobJednani.find((item) => item && !item.datumVymazu)?.hodnota)
      : null;
    const members = Array.isArray(organ.clenoveOrganu) ? organ.clenoveOrganu : [];
    for (const member of members) {
      if (!member || member.datumVymazu) continue;
      const identity = memberName(member);
      if (!identity) continue;
      const fn = lowerFirst(
        str(member.clenstvi?.funkce?.nazev) ??
          str(member.nazevAngazma) ??
          str(organ.nazevOrganu),
      );
      const key = `${identity.name}|${fn ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: identity.name,
        function: fn,
        actingMethod: acting,
        validFrom:
          day(member.clenstvi?.funkce?.vznikFunkce) ??
          day(member.clenstvi?.clenstvi?.vznikClenstvi) ??
          day(member.datumZapisu),
        ico: identity.ico,
      });
    }
  }
  return out;
}
