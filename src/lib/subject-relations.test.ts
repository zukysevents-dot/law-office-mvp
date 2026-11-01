import assert from "node:assert/strict";
import { test } from "node:test";

import { SubjectRole } from "@/generated/prisma/enums";

import {
  isMainClientRelation,
  normalizeRelationNote,
  RELATION_NOTE_MAX,
  relationRemovalError,
  relationRoleChangeError,
} from "./subject-relations";

const main = { subjectId: "s-main", role: SubjectRole.CLIENT };

test("isMainClientRelation: jen klient = hlavní subjekt projektu", () => {
  assert.equal(isMainClientRelation(main, "s-main"), true);
  assert.equal(isMainClientRelation(main, "s-other"), false);
  assert.equal(isMainClientRelation(main, null), false);
  assert.equal(
    isMainClientRelation({ subjectId: "s-main", role: SubjectRole.COUNTERPARTY }, "s-main"),
    false,
  );
});

test("relationRoleChangeError: role hlavního klienta je zamčená", () => {
  assert.match(
    relationRoleChangeError(main, "s-main", SubjectRole.COUNTERPARTY) ?? "",
    /nelze změnit/,
  );
  // Stejná role (úprava jen poznámky) projde.
  assert.equal(relationRoleChangeError(main, "s-main", SubjectRole.CLIENT), null);
  // Běžná vazba smí roli měnit.
  assert.equal(
    relationRoleChangeError(
      { subjectId: "s-x", role: SubjectRole.CLIENT },
      "s-main",
      SubjectRole.COUNTERPARTY,
    ),
    null,
  );
  // Po změně hlavního klienta je původní vazba běžná.
  assert.equal(relationRoleChangeError(main, "s-new", SubjectRole.OTHER), null);
});

test("relationRemovalError: hlavního klienta nelze odebrat, ostatní ano", () => {
  assert.match(relationRemovalError(main, "s-main") ?? "", /nelze odebrat/);
  assert.equal(relationRemovalError(main, "s-new"), null);
  assert.equal(
    relationRemovalError({ subjectId: "s-main", role: SubjectRole.OTHER }, "s-main"),
    null,
  );
});

test("normalizeRelationNote: ořez, prázdná → null, délka", () => {
  assert.equal(normalizeRelationNote("  pozn.  "), "pozn.");
  assert.equal(normalizeRelationNote("   "), null);
  assert.equal(normalizeRelationNote(null), null);
  assert.equal(normalizeRelationNote("x".repeat(RELATION_NOTE_MAX + 5))?.length, RELATION_NOTE_MAX);
});
