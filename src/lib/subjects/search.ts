/**
 * Subject full-text-ish search shared by the subject list, the global search
 * (⌘K) and the conflict check. Matches the name, IČO, person name parts, the
 * trade name, every contact value (e-mail, phone regardless of spacing, data
 * box, web), statutory body names and — exact match only — the birth number.
 * The caller always composes this with visibility / organization scoping.
 */

import type { Prisma } from "@/generated/prisma/client";
import { SubjectContactType } from "@/generated/prisma/enums";
import {
  birthNumberSearchKey,
  maskBirthNumber,
} from "@/lib/subjects/birth-number";

const contactTypeReason: Record<string, string> = {
  EMAIL: "e-mail",
  PHONE: "telefon",
  DATA_BOX: "datová schránka",
  WEB: "web",
  OTHER: "kontakt",
};

/** Digits of a phone-like query ("+420 777 12" → "42077712"), else null. */
function phoneDigits(query: string): string | null {
  if (!/^[+\d\s()./-]+$/.test(query)) {
    return null;
  }
  const digits = query.replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
}

export function subjectSearchWhere(rawQuery: string): Prisma.SubjectWhereInput {
  const query = rawQuery.trim();
  if (!query) {
    return {};
  }
  const like = { contains: query, mode: "insensitive" as const };
  const lower = query.toLowerCase();
  const or: Prisma.SubjectWhereInput[] = [
    { name: like },
    { ico: like },
    { firstName: like },
    { lastName: like },
    { tradeName: like },
    { email: like },
    {
      contacts: {
        some: {
          type: { not: SubjectContactType.PHONE },
          valueNormalized: { contains: lower },
        },
      },
    },
    { statutoryBodies: { some: { name: like } } },
  ];

  const digits = phoneDigits(query);
  if (digits) {
    or.push({
      contacts: {
        some: {
          type: SubjectContactType.PHONE,
          valueNormalized: { contains: digits },
        },
      },
    });
  }

  const birthNumber = birthNumberSearchKey(query);
  if (birthNumber) {
    or.push({ birthNumber });
  }

  return { OR: or };
}

export type SubjectSearchCandidate = {
  name: string;
  ico?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  tradeName?: string | null;
  email?: string | null;
  birthNumber?: string | null;
  contacts?: Array<{ type: string; value: string; valueNormalized: string }>;
  statutoryBodies?: Array<{ name: string; function?: string | null }>;
};

/**
 * Human-readable reasons why a subject matched (for results whose name does
 * not obviously contain the query), e.g. "e-mail fakturace@abc.cz". The birth
 * number is only ever reported masked.
 */
export function subjectMatchReasons(
  subject: SubjectSearchCandidate,
  rawQuery: string,
): string[] {
  const query = rawQuery.trim();
  if (!query) {
    return [];
  }
  const lower = query.toLowerCase();
  const includes = (value: string | null | undefined) =>
    Boolean(value && value.toLowerCase().includes(lower));
  if (includes(subject.name)) {
    return [];
  }

  const reasons: string[] = [];
  if (includes(subject.ico)) reasons.push(`IČO ${subject.ico}`);
  if (includes(subject.tradeName)) reasons.push(`obchodní firma ${subject.tradeName}`);
  if (includes(subject.firstName) || includes(subject.lastName)) {
    reasons.push(
      `jméno ${[subject.firstName, subject.lastName].filter(Boolean).join(" ")}`,
    );
  }

  const digits = phoneDigits(query);
  for (const contact of subject.contacts ?? []) {
    const hit =
      contact.type === SubjectContactType.PHONE
        ? Boolean(digits && contact.valueNormalized.includes(digits))
        : contact.valueNormalized.includes(lower);
    if (hit) {
      reasons.push(`${contactTypeReason[contact.type] ?? "kontakt"} ${contact.value}`);
    }
  }
  if (
    includes(subject.email) &&
    !(subject.contacts ?? []).some(
      (c) => c.valueNormalized === subject.email?.trim().toLowerCase(),
    )
  ) {
    reasons.push(`e-mail ${subject.email}`);
  }
  for (const body of subject.statutoryBodies ?? []) {
    if (includes(body.name)) {
      reasons.push(
        `statutární orgán ${body.function ? `${body.name} (${body.function})` : body.name}`,
      );
    }
  }

  const birthNumber = birthNumberSearchKey(query);
  if (birthNumber && subject.birthNumber === birthNumber) {
    reasons.push(`rodné číslo ${maskBirthNumber(subject.birthNumber)}`);
  }

  return Array.from(new Set(reasons));
}

/** Prisma include for the fields `subjectMatchReasons` needs. */
export const subjectSearchInclude = {
  contacts: {
    orderBy: { position: "asc" },
    select: { type: true, value: true, valueNormalized: true },
  },
  statutoryBodies: {
    orderBy: { position: "asc" },
    select: { name: true, function: true },
  },
} satisfies Prisma.SubjectInclude;
