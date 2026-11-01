// Pravidla úprav a odebírání vazeb subjektů (SubjectRelation) na projektu
// a případu. Bez závislosti na frameworku, aby šla otestovat (node --test).

import { SubjectRole } from "@/generated/prisma/enums";

export type RelationGuardInput = {
  subjectId: string;
  role: SubjectRole;
};

export const RELATION_NOTE_MAX = 1000;

/**
 * Vazba „klient = hlavní subjekt projektu“ vzniká automaticky při založení
 * projektu i případu a kontrola konfliktů z ní čte, kdo je klientem. Smí se
 * u ní měnit poznámka, ale ne role a nesmí se odebrat — hlavního klienta mění
 * úprava projektu (pak se z původní vazby stane běžná, odebratelná vazba).
 */
export function isMainClientRelation(
  relation: RelationGuardInput,
  mainSubjectId: string | null | undefined,
) {
  return (
    Boolean(mainSubjectId) &&
    relation.subjectId === mainSubjectId &&
    relation.role === SubjectRole.CLIENT
  );
}

/** Chybová hláška, pokud změna role vazby není povolená; jinak null. */
export function relationRoleChangeError(
  relation: RelationGuardInput,
  mainSubjectId: string | null | undefined,
  nextRole: SubjectRole,
): string | null {
  if (nextRole !== relation.role && isMainClientRelation(relation, mainSubjectId)) {
    return "Roli hlavního klienta projektu nelze změnit. Klienta změníte v úpravě projektu.";
  }
  return null;
}

/** Chybová hláška, pokud vazbu nelze odebrat; jinak null. */
export function relationRemovalError(
  relation: RelationGuardInput,
  mainSubjectId: string | null | undefined,
): string | null {
  if (isMainClientRelation(relation, mainSubjectId)) {
    return "Vazbu na hlavního klienta projektu nelze odebrat. Klienta změníte v úpravě projektu.";
  }
  return null;
}

/** Poznámka vazby: oříznutá, prázdná → null, nejvýše RELATION_NOTE_MAX znaků. */
export function normalizeRelationNote(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const note = value.trim();
  return note ? note.slice(0, RELATION_NOTE_MAX) : null;
}
