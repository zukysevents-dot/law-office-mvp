import assert from "node:assert/strict";
import { test } from "node:test";

import { HrNewsAudience, UserRole } from "@/generated/prisma/enums";
import { userRoleLabels } from "@/lib/labels";

import {
  NEWS_BODY_MAX,
  NEWS_TITLE_MAX,
  activeNewsWhere,
  isNewsActive,
  isNewsTargetedTo,
  newsAudienceSummary,
  normalizeNewsBody,
  parseNewsAudience,
  validateNewsText,
} from "./news";

// --- parseNewsAudience ------------------------------------------------------

test("parseNewsAudience: celá kancelář zahodí role i lidi", () => {
  assert.deepEqual(
    parseNewsAudience({ audience: "ALL", roles: ["PARTNER"], userIds: ["u1"] }),
    { audience: HrNewsAudience.ALL, roles: [], userIds: [] },
  );
});

test("parseNewsAudience: neznámý typ → celá kancelář", () => {
  assert.deepEqual(
    parseNewsAudience({ audience: "EVERYONE", roles: [], userIds: [] }),
    { audience: HrNewsAudience.ALL, roles: [], userIds: [] },
  );
  assert.equal(
    parseNewsAudience({ audience: null, roles: [], userIds: [] }).audience,
    HrNewsAudience.ALL,
  );
});

test("parseNewsAudience: role — jen platné, bez duplicit, lidi se zahodí", () => {
  assert.deepEqual(
    parseNewsAudience({
      audience: "ROLES",
      roles: ["TRAINEE", "HACKER", "TRAINEE", "INTERN"],
      userIds: ["u1"],
    }),
    {
      audience: HrNewsAudience.ROLES,
      roles: [UserRole.TRAINEE, UserRole.INTERN],
      userIds: [],
    },
  );
});

test("parseNewsAudience: role bez výběru → chyba", () => {
  assert.throws(
    () => parseNewsAudience({ audience: "ROLES", roles: ["NOPE"], userIds: [] }),
    /aspoň jednu roli/,
  );
});

test("parseNewsAudience: konkrétní lidé — bez duplicit, role se zahodí", () => {
  assert.deepEqual(
    parseNewsAudience({
      audience: "USERS",
      roles: ["PARTNER"],
      userIds: ["u1", "u2", "u1", ""],
    }),
    { audience: HrNewsAudience.USERS, roles: [], userIds: ["u1", "u2"] },
  );
  assert.throws(
    () => parseNewsAudience({ audience: "USERS", roles: [], userIds: [] }),
    /aspoň jednoho kolegu/,
  );
});

// --- text ---------------------------------------------------------------------

test("validateNewsText: hlídá délku nadpisu a textu", () => {
  validateNewsText("a".repeat(NEWS_TITLE_MAX), "b".repeat(NEWS_BODY_MAX));
  assert.throws(() => validateNewsText("a".repeat(NEWS_TITLE_MAX + 1), "b"));
  assert.throws(() => validateNewsText("a", "b".repeat(NEWS_BODY_MAX + 1)));
});

test("normalizeNewsBody: zachová zalomení řádků, sjednotí CRLF", () => {
  assert.equal(
    normalizeNewsBody("Ahoj,\r\n\r\nzítra nejde proud.\r\nDíky  \n\n"),
    "Ahoj,\n\nzítra nejde proud.\nDíky",
  );
});

// --- isNewsTargetedTo ---------------------------------------------------------

const trainee = { id: "u-trainee", role: UserRole.TRAINEE };

test("isNewsTargetedTo: celá kancelář → každý", () => {
  assert.equal(
    isNewsTargetedTo(
      { audience: HrNewsAudience.ALL, audienceRoles: [], recipients: [] },
      trainee,
    ),
    true,
  );
});

test("isNewsTargetedTo: role podle role uživatele", () => {
  const news = {
    audience: HrNewsAudience.ROLES,
    audienceRoles: [UserRole.TRAINEE, UserRole.INTERN],
    recipients: [],
  };
  assert.equal(isNewsTargetedTo(news, trainee), true);
  assert.equal(isNewsTargetedTo(news, { id: "p", role: UserRole.PARTNER }), false);
});

test("isNewsTargetedTo: konkrétní lidé podle příjemců", () => {
  const news = {
    audience: HrNewsAudience.USERS,
    audienceRoles: [UserRole.TRAINEE],
    recipients: [{ userId: "u-other" }],
  };
  // Role v audienceRoles se u USERS neuplatní.
  assert.equal(isNewsTargetedTo(news, trainee), false);
  assert.equal(isNewsTargetedTo(news, { id: "u-other", role: UserRole.LAWYER }), true);
});

// --- platnost -----------------------------------------------------------------

const today = new Date("2026-11-01T00:00:00.000Z");

test("isNewsActive: bez data konce platí, archivovaná ne", () => {
  assert.equal(isNewsActive({ visibleUntil: null }, today), true);
  assert.equal(isNewsActive({ archivedAt: new Date(), visibleUntil: null }, today), false);
});

test("isNewsActive: poslední den zobrazení se počítá včetně", () => {
  assert.equal(isNewsActive({ visibleUntil: today }, today), true);
  assert.equal(
    isNewsActive({ visibleUntil: new Date("2026-10-31T00:00:00.000Z") }, today),
    false,
  );
});

test("activeNewsWhere: nearchivované bez konce nebo s koncem od dneška", () => {
  assert.deepEqual(activeNewsWhere(today), {
    archivedAt: null,
    OR: [{ visibleUntil: null }, { visibleUntil: { gte: today } }],
  });
});

// --- newsAudienceSummary ------------------------------------------------------

test("newsAudienceSummary: popisky pro všechny typy adresátů", () => {
  assert.equal(
    newsAudienceSummary(
      { audience: HrNewsAudience.ALL, audienceRoles: [], recipients: [] },
      userRoleLabels,
    ),
    "Celá kancelář",
  );
  assert.equal(
    newsAudienceSummary(
      {
        audience: HrNewsAudience.ROLES,
        // Pořadí podle hierarchie rolí, ne podle uložení.
        audienceRoles: [UserRole.INTERN, UserRole.PARTNER],
        recipients: [],
      },
      userRoleLabels,
    ),
    "Role: Partner, Praktikant",
  );
  assert.equal(
    newsAudienceSummary(
      {
        audience: HrNewsAudience.USERS,
        audienceRoles: [],
        recipients: [{ user: { name: "Eva Malá" } }, { user: { name: "Adam Bílý" } }, { user: null }],
      },
      userRoleLabels,
    ),
    "Vybraní kolegové: Adam Bílý, Eva Malá",
  );
});
