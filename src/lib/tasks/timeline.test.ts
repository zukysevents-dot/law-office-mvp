import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTaskTimeline, describeTaskEvent } from "./timeline";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const event = (overrides: Partial<Parameters<typeof describeTaskEvent>[0]> = {}) => ({
  type: "DEADLINE_POSTPONED",
  oldDeadline: d("2026-10-12"),
  newDeadline: d("2026-10-20"),
  reason: null,
  relatedTask: null,
  ...overrides,
});

test("buildTaskTimeline: komentáře a události společně, nejnovější nahoře", () => {
  const items = buildTaskTimeline(
    [
      { id: "c1", comment: "první", createdAt: new Date("2026-10-01T10:00:00Z"), author: null },
      { id: "c2", comment: "druhý", createdAt: new Date("2026-10-03T10:00:00Z"), author: null },
    ],
    [
      {
        id: "e1",
        ...event(),
        createdAt: new Date("2026-10-02T10:00:00Z"),
        actor: { name: "Admin Demo" },
      },
    ],
  );
  assert.deepEqual(
    items.map((item) => item.id),
    ["comment:c2", "event:e1", "comment:c1"],
  );
  assert.equal(items[1].kind, "event");
});

test("buildTaskTimeline: stejný čas má stabilní pořadí", () => {
  const at = new Date("2026-10-02T10:00:00Z");
  const first = buildTaskTimeline(
    [{ id: "a", comment: "x", createdAt: at, author: null }],
    [{ id: "b", ...event(), createdAt: at, actor: null }],
  ).map((item) => item.id);
  const second = buildTaskTimeline(
    [{ id: "a", comment: "x", createdAt: at, author: null }],
    [{ id: "b", ...event(), createdAt: at, actor: null }],
  ).map((item) => item.id);
  assert.deepEqual(first, second);
});

test("describeTaskEvent: odložení s důvodem", () => {
  const text = describeTaskEvent(event({ reason: "čekáme na klienta" }), {
    relatedVisible: false,
  });
  assert.equal(text.title, "Termín odložen z 12. 10. 2026 na 20. 10. 2026");
  assert.equal(text.detail, "Důvod: čekáme na klienta");
  assert.equal(text.tone, "postpone");
});

test("describeTaskEvent: posun na pozdější datum v úpravě úkolu", () => {
  const text = describeTaskEvent(event({ viaEdit: true }), { relatedVisible: false });
  assert.equal(text.title, "Termín změněn při úpravě úkolu z 12. 10. 2026 na 20. 10. 2026");
  assert.equal(text.tone, "postpone");
});

test("describeTaskEvent: změna termínu při úpravě (změna, nastavení, odstranění)", () => {
  assert.equal(
    describeTaskEvent(
      event({ type: "DEADLINE_CHANGED", oldDeadline: d("2026-10-20"), newDeadline: d("2026-10-01") }),
      { relatedVisible: false },
    ).title,
    "Termín změněn při úpravě úkolu z 20. 10. 2026 na 01. 10. 2026",
  );
  assert.equal(
    describeTaskEvent(event({ type: "DEADLINE_CHANGED", oldDeadline: null }), {
      relatedVisible: false,
    }).title,
    "Termín nastaven při úpravě úkolu na 20. 10. 2026",
  );
  assert.equal(
    describeTaskEvent(event({ type: "DEADLINE_CHANGED", newDeadline: null }), {
      relatedVisible: false,
    }).title,
    "Termín odstraněn při úpravě úkolu (byl 12. 10. 2026)",
  );
});

test("describeTaskEvent: duplikace s odkazem jen pro viditelný úkol", () => {
  const visible = describeTaskEvent(
    event({ type: "DUPLICATED_FROM", relatedTask: { id: "t1", title: "Žaloba" } }),
    { relatedVisible: true },
  );
  assert.equal(visible.title, "Úkol vytvořen duplikací z úkolu");
  assert.deepEqual(visible.link, { href: "/tasks/t1", label: "„Žaloba“" });

  const hidden = describeTaskEvent(
    event({ type: "DUPLICATED_TO", relatedTask: { id: "t2", title: "Tajné" } }),
    { relatedVisible: false },
  );
  assert.equal(hidden.link, null);
  assert.equal(hidden.title, "Úkol byl duplikován do úkolu, ke kterému nemáte přístup");
  assert.ok(!hidden.title.includes("Tajné"));

  const gone = describeTaskEvent(event({ type: "DUPLICATED_FROM" }), {
    relatedVisible: true,
  });
  assert.equal(gone.link, null);
  assert.match(gone.title, /už neexistuje/);
});
