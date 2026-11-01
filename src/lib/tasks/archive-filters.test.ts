import assert from "node:assert/strict";
import { test } from "node:test";

import {
  archiveMonthOptions,
  archiveRangeSummary,
  hasActiveArchiveFilters,
  parseTaskArchiveFilters,
  resolveTaskArchiveRange,
  taskArchiveWhere,
  type TaskArchiveFilters,
} from "./archive-filters";

const empty = parseTaskArchiveFilters({});

function filters(overrides: Partial<TaskArchiveFilters>): TaskArchiveFilters {
  return { ...empty, ...overrides };
}

// --- parse -----------------------------------------------------------------

test("parseTaskArchiveFilters: výchozí stav bez filtrů", () => {
  assert.deepEqual(empty, {
    subjectId: "",
    projectId: "",
    caseId: "",
    createdById: "",
    assigneeId: "",
    supervisorId: "",
    q: "",
    dateField: "closed",
    period: "",
    dateFrom: "",
    dateTo: "",
  });
  assert.equal(hasActiveArchiveFilters(empty), false);
});

test("parseTaskArchiveFilters: neplatné hodnoty se tiše ignorují", () => {
  const parsed = parseTaskArchiveFilters({
    subjectId: "bad id!",
    projectId: "x".repeat(65),
    dateField: "updated",
    period: "2026-13",
    dateFrom: "2026-02-30",
    dateTo: "nesmysl",
  });
  assert.equal(parsed.subjectId, "");
  assert.equal(parsed.projectId, "");
  assert.equal(parsed.dateField, "closed");
  assert.equal(parsed.period, "");
  assert.equal(parsed.dateFrom, "");
  assert.equal(parsed.dateTo, "");
  assert.equal(hasActiveArchiveFilters(parsed), false);
});

test("parseTaskArchiveFilters: Od/Do přebije období, pole ve tvaru pole vezme první", () => {
  const parsed = parseTaskArchiveFilters({
    period: "this-month",
    dateFrom: "2026-01-01",
    assigneeId: ["u1", "u2"],
    q: "  žaloba ",
  });
  assert.equal(parsed.period, "custom");
  assert.equal(parsed.dateFrom, "2026-01-01");
  assert.equal(parsed.assigneeId, "u1");
  assert.equal(parsed.q, "žaloba");
  assert.equal(hasActiveArchiveFilters(parsed), true);
  // Od/Do bez „custom“ se neuplatní, když nejsou vyplněné.
  assert.equal(parseTaskArchiveFilters({ period: "2026-01" }).period, "2026-01");
});

// --- range -----------------------------------------------------------------

const now = new Date("2026-10-27T10:00:00.000Z");

test("resolveTaskArchiveRange: leden 2026 v pražském čase", () => {
  const range = resolveTaskArchiveRange(filters({ period: "2026-01" }), now);
  assert.equal(range?.gte?.toISOString(), "2025-12-31T23:00:00.000Z");
  assert.equal(range?.lt?.toISOString(), "2026-01-31T23:00:00.000Z");
  assert.equal(range?.label, "leden 2026");
});

test("resolveTaskArchiveRange: březen 2026 (přechod na letní čas)", () => {
  const range = resolveTaskArchiveRange(filters({ period: "2026-03" }), now);
  assert.equal(range?.gte?.toISOString(), "2026-02-28T23:00:00.000Z");
  assert.equal(range?.lt?.toISOString(), "2026-03-31T22:00:00.000Z");
  assert.equal(range?.label, "březen 2026");
});

test("resolveTaskArchiveRange: tento a minulý měsíc (leden → prosinec předchozího roku)", () => {
  const january = new Date("2026-01-10T10:00:00.000Z");
  const last = resolveTaskArchiveRange(filters({ period: "last-month" }), january);
  assert.equal(last?.label, "prosinec 2025");
  assert.equal(last?.gte?.toISOString(), "2025-11-30T23:00:00.000Z");
  assert.equal(last?.lt?.toISOString(), "2025-12-31T23:00:00.000Z");
  const current = resolveTaskArchiveRange(filters({ period: "this-month" }), now);
  assert.equal(current?.label, "říjen 2026");
  // Poslední noc v měsíci po půlnoci pražského času už patří dalšímu měsíci.
  const lateNight = new Date("2026-10-31T23:30:00.000Z");
  assert.equal(
    resolveTaskArchiveRange(filters({ period: "this-month" }), lateNight)?.label,
    "listopad 2026",
  );
});

test("resolveTaskArchiveRange: termín (deadline) má UTC hranice", () => {
  const range = resolveTaskArchiveRange(
    filters({ period: "2026-01", dateField: "deadline" }),
    now,
  );
  assert.equal(range?.gte?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(range?.lt?.toISOString(), "2026-02-01T00:00:00.000Z");
});

test("resolveTaskArchiveRange: vlastní rozsah včetně celého dne Do, prohozené Od/Do", () => {
  const range = resolveTaskArchiveRange(
    filters({ period: "custom", dateFrom: "2026-02-28", dateTo: "2026-01-01" }),
    now,
  );
  assert.equal(range?.gte?.toISOString(), "2025-12-31T23:00:00.000Z");
  assert.equal(range?.lt?.toISOString(), "2026-02-28T23:00:00.000Z");
  assert.equal(range?.label, "01. 01. 2026 – 28. 02. 2026");

  const onlyFrom = resolveTaskArchiveRange(
    filters({ period: "custom", dateFrom: "2026-01-01", dateField: "deadline" }),
    now,
  );
  assert.equal(onlyFrom?.gte?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(onlyFrom?.lt, undefined);
  assert.equal(onlyFrom?.label, "od 01. 01. 2026");

  assert.equal(resolveTaskArchiveRange(filters({ period: "custom" }), now), null);
  assert.equal(resolveTaskArchiveRange(empty, now), null);
});

test("archiveRangeSummary: k jakému datu se rozsah vztahuje", () => {
  const range = resolveTaskArchiveRange(filters({ period: "2026-01" }), now);
  assert.equal(
    archiveRangeSummary("closed", range),
    "dokončené nebo archivované v období leden 2026",
  );
  assert.equal(archiveRangeSummary("deadline", range), "s termínem v období leden 2026");
  assert.equal(archiveRangeSummary("created", range), "založené v období leden 2026");
  assert.equal(archiveRangeSummary("closed", null), null);
});

// --- where ---------------------------------------------------------------

test("taskArchiveWhere: bez filtrů jen archivované", () => {
  assert.deepEqual(taskArchiveWhere(empty, now), { archivedAt: { not: null } });
});

test("taskArchiveWhere: datum dokončení = completedAt, jinak archivedAt", () => {
  const where = taskArchiveWhere(filters({ period: "2026-01" }), now);
  const range = {
    gte: new Date("2025-12-31T23:00:00.000Z"),
    lt: new Date("2026-01-31T23:00:00.000Z"),
  };
  assert.deepEqual(where, {
    AND: [
      { archivedAt: { not: null } },
      { OR: [{ completedAt: range }, { completedAt: null, archivedAt: range }] },
    ],
  });
});

test("taskArchiveWhere: subjekt, projekt, osoby, název a založení", () => {
  const where = taskArchiveWhere(
    filters({
      subjectId: "s1",
      projectId: "p1",
      caseId: "c1",
      createdById: "u0",
      assigneeId: "u1",
      supervisorId: "u2",
      q: "žaloba",
      dateField: "created",
      period: "2026-01",
    }),
    now,
  ) as { AND: unknown[] };
  assert.deepEqual(where.AND.slice(1, 9), [
    {
      OR: [
        { project: { mainSubjectId: "s1" } },
        { case: { project: { mainSubjectId: "s1" } } },
      ],
    },
    { OR: [{ projectId: "p1" }, { case: { projectId: "p1" } }] },
    { caseId: "c1" },
    { createdById: "u0" },
    {
      OR: [
        { assignedToId: "u1" },
        { assignees: { some: { userId: "u1", role: "ASSIGNEE" } } },
      ],
    },
    { assignees: { some: { userId: "u2", role: "SUPERVISOR" } } },
    { title: { contains: "žaloba", mode: "insensitive" } },
    {
      createdAt: {
        gte: new Date("2025-12-31T23:00:00.000Z"),
        lt: new Date("2026-01-31T23:00:00.000Z"),
      },
    },
  ]);
});

// --- měsíce ---------------------------------------------------------------

test("archiveMonthOptions: od aktuálního měsíce zpět k nejstaršímu, česky", () => {
  const options = archiveMonthOptions(new Date("2026-07-20T10:00:00.000Z"), now);
  assert.deepEqual(
    options.map((option) => option.value),
    ["2026-10", "2026-09", "2026-08", "2026-07"],
  );
  assert.equal(options[0].label, "říjen 2026");
  assert.equal(options[3].label, "červenec 2026");
  assert.deepEqual(
    archiveMonthOptions(null, now).map((option) => option.value),
    ["2026-10"],
  );
});

test("archiveMonthOptions: strop 60 měsíců a přechod přes rok", () => {
  const options = archiveMonthOptions(new Date("2010-01-01T00:00:00.000Z"), now);
  assert.equal(options.length, 60);
  assert.equal(options[9].value, "2026-01");
  assert.equal(options[10].value, "2025-12");
  assert.equal(options[10].label, "prosinec 2025");
});
