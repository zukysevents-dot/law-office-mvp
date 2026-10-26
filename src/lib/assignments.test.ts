import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_BULK_TARGETS,
  NOTIFICATION_ITEM_LIMIT,
  assigneeFilterValue,
  caseAssigneeFilterWhere,
  formatMatterAssignedNotification,
  formatTeamJoinedNotification,
  groupAssignmentNotifications,
  parseAssigneeFilter,
  parseAssigneeToken,
  parseMatterTargets,
  projectAssigneeFilterWhere,
  projectTeamWhere,
  type AssignmentGrant,
} from "./assignments";

const link = (path: string) => `https://app.example${path}`;

test("parseAssigneeToken: user/team tokens, everything else null", () => {
  assert.deepEqual(parseAssigneeToken("user:abc123"), { kind: "user", id: "abc123" });
  assert.deepEqual(parseAssigneeToken(" team:t-1 "), { kind: "team", id: "t-1" });
  for (const value of ["", "abc", "user:", "group:x", "team:a b", "user:a;drop", null, 5]) {
    assert.equal(parseAssigneeToken(value), null, String(value));
  }
});

test("parseMatterTargets: splits, dedupes and ignores unknown prefixes", () => {
  assert.deepEqual(
    parseMatterTargets(["project:p1", "case:c1", "project:p1", "task:t1", "x", 3, "case:c2"]),
    { projectIds: ["p1"], caseIds: ["c1", "c2"] },
  );
});

test("parseMatterTargets: caps the total at MAX_BULK_TARGETS", () => {
  const values = Array.from({ length: MAX_BULK_TARGETS + 50 }, (_, i) => `project:p${i}`);
  const result = parseMatterTargets(values);
  assert.equal(result.projectIds.length + result.caseIds.length, MAX_BULK_TARGETS);
});

test("parseAssigneeFilter / assigneeFilterValue round-trip", () => {
  for (const value of ["", "me", "none", "some", "user:u1", "team:t1"]) {
    assert.equal(assigneeFilterValue(parseAssigneeFilter(value)), value);
  }
  assert.deepEqual(parseAssigneeFilter("whatever"), { kind: "any" });
  assert.deepEqual(parseAssigneeFilter(undefined), { kind: "any" });
});

test("projectAssigneeFilterWhere: me / user = responsible, assignee or team member", () => {
  const me = projectAssigneeFilterWhere({ kind: "me" }, "u1");
  assert.deepEqual(me, {
    OR: [
      { responsibleUserId: "u1" },
      { assignees: { some: { userId: "u1" } } },
      projectTeamWhere("u1"),
    ],
  });
  assert.deepEqual(projectAssigneeFilterWhere({ kind: "user", id: "u2" }, "u1"), {
    OR: [
      { responsibleUserId: "u2" },
      { assignees: { some: { userId: "u2" } } },
      projectTeamWhere("u2"),
    ],
  });
});

test("projectAssigneeFilterWhere: team / none / any", () => {
  assert.deepEqual(projectAssigneeFilterWhere({ kind: "team", id: "t1" }, "u1"), {
    teamAssignments: { some: { legalTeamId: "t1" } },
  });
  assert.deepEqual(projectAssigneeFilterWhere({ kind: "none" }, "u1"), {
    assignees: { none: {} },
    teamAssignments: { none: { legalTeam: { is: { archivedAt: null } } } },
  });
  assert.deepEqual(projectAssigneeFilterWhere({ kind: "any" }, "u1"), {});
});

test("caseAssigneeFilterWhere: includes the project's assignees and teams", () => {
  const me = caseAssigneeFilterWhere({ kind: "me" }, "u1") as { OR: unknown[] };
  assert.equal(me.OR.length, 6);
  assert.ok(
    me.OR.some(
      (branch) =>
        JSON.stringify(branch) ===
        JSON.stringify({ project: { is: projectTeamWhere("u1") } }),
    ),
  );
  const team = caseAssigneeFilterWhere({ kind: "team", id: "t1" }, "u1") as {
    OR: unknown[];
  };
  assert.equal(team.OR.length, 2);
  const none = caseAssigneeFilterWhere({ kind: "none" }, "u1") as {
    project?: unknown;
  };
  assert.ok(none.project, "bez řešitelů = ani případ, ani jeho projekt");
  assert.deepEqual(caseAssigneeFilterWhere({ kind: "any" }, "u1"), {});
});

const project = (id: string) => ({ kind: "project" as const, id, name: `Projekt ${id}`, clientName: "ABC s.r.o." });

test("groupAssignmentNotifications: actor excluded, direct + team counts once", () => {
  const grants: AssignmentGrant[] = [
    { matter: project("p1"), assignmentId: "a1", userIds: ["u1", "actor"], teamName: "Spory" },
    { matter: project("p1"), assignmentId: "a2", userIds: ["u1"], teamName: null },
    { matter: project("p2"), assignmentId: "a3", userIds: ["u1", "u2"], teamName: "Spory" },
  ];
  const notices = groupAssignmentNotifications(grants, "actor");
  assert.deepEqual(
    notices.map((n) => n.recipientId).sort(),
    ["u1", "u2"],
  );
  const u1 = notices.find((n) => n.recipientId === "u1");
  assert.equal(u1?.items.length, 2);
  // Přímé přiřazení má přednost před týmovým.
  assert.equal(u1?.items.find((i) => i.matter.id === "p1")?.teamName, null);
  const u2 = notices.find((n) => n.recipientId === "u2");
  assert.equal(u2?.items.length, 1);
});

test("formatMatterAssignedNotification: single direct and team texts", () => {
  const direct = formatMatterAssignedNotification(
    [{ matter: project("p1"), assignmentId: "a1", teamName: null }],
    link,
  );
  assert.equal(direct.subject, "Přiřazení k projektu: Projekt p1");
  assert.match(direct.body, /Byli jste přidáni mezi řešitele projektu „Projekt p1“ \(klient ABC s\.r\.o\.\)\./);
  assert.match(direct.body, /Odkaz: https:\/\/app\.example\/projects\/p1/);
  assert.equal(direct.dedupeKey, "matter-assigned:project:a1");

  const viaTeam = formatMatterAssignedNotification(
    [
      {
        matter: { kind: "case", id: "c1", name: "Žaloba" },
        assignmentId: "a9",
        teamName: "Spory",
      },
    ],
    link,
  );
  assert.equal(viaTeam.subject, "Přiřazení k případu: Žaloba");
  assert.match(viaTeam.body, /Tým „Spory“, jehož jste členem, byl přidán mezi řešitele případu „Žaloba“\./);
  assert.match(viaTeam.body, /\/cases\/c1/);
});

test("formatMatterAssignedNotification: bulk summary is capped", () => {
  const items = Array.from({ length: NOTIFICATION_ITEM_LIMIT + 3 }, (_, i) => ({
    matter: project(`p${i}`),
    assignmentId: `a${i}`,
    teamName: "Spory",
  }));
  const summary = formatMatterAssignedNotification(items, link);
  assert.equal(summary.subject, `Přiřazení k ${items.length} projektům`);
  assert.match(summary.body, /^Tým „Spory“, jehož jste členem/);
  assert.equal(summary.body.split("\n").filter((line) => line.startsWith("- ")).length, NOTIFICATION_ITEM_LIMIT);
  assert.match(summary.body, /… a další \(3\)/);
  assert.equal(summary.dedupeKey, "matter-assigned:bulk:a0");

  const mixed = formatMatterAssignedNotification(
    [
      { matter: project("p1"), assignmentId: "a1", teamName: null },
      { matter: { kind: "case", id: "c1", name: "Žaloba" }, assignmentId: "a2", teamName: "Spory" },
    ],
    link,
  );
  assert.equal(mixed.subject, "Přiřazení k 2 projektům a případům");
  assert.match(mixed.body, /osobně nebo přes tým/);
});

test("formatTeamJoinedNotification: counts in Czech genitive", () => {
  const joined = formatTeamJoinedNotification(
    { teamName: "Spory", projectCount: 1, caseCount: 3 },
    link,
  );
  assert.equal(joined.subject, "Přidání do týmu: Spory");
  assert.match(joined.body, /Tým je řešitelem 1 projektu a 3 případů/);
  assert.match(joined.body, /\/projects\?assignee=me/);
  const empty = formatTeamJoinedNotification(
    { teamName: "Spory", projectCount: 0, caseCount: 0 },
    link,
  );
  assert.match(empty.body, /zatím není řešitelem/);
});
