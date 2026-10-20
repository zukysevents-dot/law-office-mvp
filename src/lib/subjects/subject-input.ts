/**
 * Parses the subject create/edit form into the `Subject` columns plus the
 * contact and statutory-body child rows. Type-aware:
 * - PERSON (fyzická osoba): name parts, birth date/number, nationality; no
 *   IČO/DIČ/legal form (kept only when the form still showed them for legacy
 *   data);
 * - ENTREPRENEUR (FOP): name parts + optional trade name, IČO, DIČ, legal
 *   form; no birth number / nationality;
 * - COMPANY / OTHER: name, IČO, DIČ, legal form; no personal fields.
 * Derived columns stay in sync on every write: `name` (composed),
 * `email` (primary e-mail) and `statutoryBody` (summary of current bodies).
 */

import { FeeType, SubjectType } from "@/generated/prisma/enums";
import {
  checkboxValue,
  enumValue,
  indexedRows,
  optionalDate,
  optionalNumber,
  optionalString,
} from "@/lib/form";
import { parseBirthNumber } from "@/lib/subjects/birth-number";
import {
  MAX_SUBJECT_CONTACTS,
  parseContactRows,
  primaryEmail,
  type ContactRow,
} from "@/lib/subjects/contacts";
import { composeSubjectName } from "@/lib/subjects/person-name";
import {
  MAX_SUBJECT_STATUTORY_BODIES,
  STATUTORY_FIELDS,
  parseStatutoryRows,
  statutorySummary,
  type StatutoryRow,
} from "@/lib/subjects/statutory";
import { isSafeHttpUrl } from "@/lib/utils";

export const CONTACT_FIELDS = ["id", "type", "value", "label", "primary"] as const;

export type SubjectFormError =
  | "name"
  | "personName"
  | "birthNumber"
  | "contact"
  | "statutory";

export const subjectFormErrorMessages: Record<SubjectFormError | "ico", string> = {
  ico: "Subjekt s tímto IČO už ve vaší kanceláři existuje.",
  name: "Vyplňte název subjektu.",
  personName: "U fyzické osoby vyplňte jméno i příjmení.",
  birthNumber: "Rodné číslo musí mít tvar 123456/7890 (9 nebo 10 číslic).",
  contact:
    "Některý kontakt není platný (zkontrolujte e-mail, telefon nebo web).",
  statutory:
    "U statutárního orgánu vyplňte jméno a datum „Do“ nesmí být před „Od“.",
};

export function subjectFormErrorMessage(code: string | undefined) {
  return code && code in subjectFormErrorMessages
    ? subjectFormErrorMessages[code as keyof typeof subjectFormErrorMessages]
    : null;
}

export type SubjectData = {
  type: SubjectType;
  name: string;
  ico: string | null;
  dic: string | null;
  email: string | null;
  address: string | null;
  deliveryAddress: string | null;
  legalForm: string | null;
  statutoryBody: string | null;
  titleBefore: string | null;
  firstName: string | null;
  lastName: string | null;
  titleAfter: string | null;
  birthDate: Date | null;
  birthNumber: string | null;
  nationality: string | null;
  tradeName: string | null;
  status: string;
  insolvencyStatus: string | null;
  riskFlag: boolean;
  internalNote: string | null;
  legalServicesContractUrl: string | null;
  sharepointUrl: string | null;
  feeType: FeeType;
  hourlyRate: number | null;
  flatFee: number | null;
  feeNote: string | null;
};

export type SubjectFormResult =
  | {
      ok: true;
      subject: SubjectData;
      contacts: ContactRow[];
      statutory: StatutoryRow[];
    }
  | { ok: false; error: SubjectFormError };

export function parseSubjectForm(
  formData: FormData,
  now: Date = new Date(),
): SubjectFormResult {
  const type = enumValue(SubjectType, formData.get("type"), SubjectType.COMPANY);
  const isPerson = type === SubjectType.PERSON;
  const isEntrepreneur = type === SubjectType.ENTREPRENEUR;
  const isNatural = isPerson || isEntrepreneur;

  // --- identity -----------------------------------------------------------
  const titleBefore = isNatural ? optionalString(formData, "titleBefore") : null;
  const firstName = isNatural ? optionalString(formData, "firstName") : null;
  const lastName = isNatural ? optionalString(formData, "lastName") : null;
  const titleAfter = isNatural ? optionalString(formData, "titleAfter") : null;
  const tradeName = isEntrepreneur ? optionalString(formData, "tradeName") : null;
  if (isNatural && (!firstName || !lastName)) {
    return { ok: false, error: "personName" };
  }

  let birthDate = isNatural ? optionalDate(formData, "birthDate") : null;
  if (birthDate && Number.isNaN(birthDate.getTime())) {
    birthDate = null;
  }
  let birthNumber: string | null = null;
  if (isPerson) {
    const parsed = parseBirthNumber(optionalString(formData, "birthNumber"), now);
    if (parsed && !parsed.ok) {
      return { ok: false, error: "birthNumber" };
    }
    if (parsed?.ok) {
      birthNumber = parsed.normalized;
      // Same rule as the form: a date is derived only from a valid RČ (an RČ
      // with a bad checksum is saved with a warning, but its date is unreliable).
      if (!birthDate && parsed.birthDate && parsed.checksumValid) {
        birthDate = parsed.birthDate;
      }
    }
  }

  const name = composeSubjectName(type, {
    name: optionalString(formData, "name"),
    titleBefore,
    firstName,
    lastName,
    titleAfter,
    tradeName,
  });
  if (!name) {
    return { ok: false, error: "name" };
  }

  // A person has no IČO/DIČ; the form only renders them for legacy data so
  // the user can see and clear them — a hidden field is not submitted → null.
  const ico = optionalString(formData, "ico");
  const dic = optionalString(formData, "dic");

  // --- child rows -----------------------------------------------------------
  const contactsResult = parseContactRows(
    indexedRows(formData, "contact", CONTACT_FIELDS, MAX_SUBJECT_CONTACTS + 1),
  );
  if (!contactsResult.ok) {
    return { ok: false, error: "contact" };
  }
  const statutoryResult = parseStatutoryRows(
    indexedRows(
      formData,
      "statutory",
      STATUTORY_FIELDS,
      MAX_SUBJECT_STATUTORY_BODIES + 1,
    ),
  );
  if (!statutoryResult.ok) {
    return { ok: false, error: "statutory" };
  }

  // Defense-in-depth: never persist a non-http(s) URL (e.g. javascript:/data:)
  // so it can't later be rendered as a clickable link.
  const rawContractUrl = optionalString(formData, "legalServicesContractUrl");

  return {
    ok: true,
    subject: {
      type,
      name,
      ico,
      dic,
      email: primaryEmail(contactsResult.contacts),
      address: optionalString(formData, "address"),
      deliveryAddress: optionalString(formData, "deliveryAddress"),
      legalForm: isPerson ? null : optionalString(formData, "legalForm"),
      statutoryBody: statutorySummary(statutoryResult.rows, now),
      titleBefore,
      firstName,
      lastName,
      titleAfter,
      birthDate,
      birthNumber,
      nationality: isPerson ? optionalString(formData, "nationality") : null,
      tradeName,
      status: optionalString(formData, "status") ?? "ACTIVE",
      insolvencyStatus: optionalString(formData, "insolvencyStatus"),
      riskFlag: checkboxValue(formData, "riskFlag"),
      internalNote: optionalString(formData, "internalNote"),
      legalServicesContractUrl: isSafeHttpUrl(rawContractUrl) ? rawContractUrl : null,
      sharepointUrl: optionalString(formData, "sharepointUrl"),
      feeType: enumValue(FeeType, formData.get("feeType"), FeeType.HOURLY),
      hourlyRate: optionalNumber(formData, "hourlyRate"),
      flatFee: optionalNumber(formData, "flatFee"),
      feeNote: optionalString(formData, "feeNote"),
    },
    contacts: contactsResult.contacts,
    statutory: statutoryResult.rows,
  };
}

/**
 * Rates (hourly rate, flat fee) are written only by users who may see them
 * ("Vidí sazby a částky"). For anyone else the columns are left out of the
 * write, so a create stores none and an update keeps the stored values — even
 * when the request carries crafted `hourlyRate` / `flatFee` fields.
 */
export function subjectWriteData(
  subject: SubjectData,
  canViewRates: boolean,
): Omit<SubjectData, "hourlyRate" | "flatFee"> &
  Partial<Pick<SubjectData, "hourlyRate" | "flatFee">> {
  const { hourlyRate, flatFee, ...rest } = subject;
  return canViewRates ? { ...rest, hourlyRate, flatFee } : rest;
}
