import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTemplateContext,
  renderTemplate,
  SUPPORTED_PLACEHOLDERS,
  type TemplateContextInput,
} from "./templates";

const fullInput: TemplateContextInput = {
  caseName: "Žaloba na zaplacení",
  fileNumber: "ABC-001/2026",
  projectName: "Soudní spor ABC",
  client: {
    name: "ABC s.r.o.",
    ico: "12345678",
    dic: "CZ12345678",
    address: "Praha 1",
  },
  counterparty: { name: "XYZ s.r.o.", ico: "87654321" },
  lawyerName: "Partner Demo",
  orgName: "Demo advokátní kancelář",
  today: new Date("2026-06-25T10:00:00.000Z"),
};

// --- renderTemplate ---------------------------------------------------------

test("renderTemplate: substitutes known tokens (whitespace tolerant)", () => {
  const ctx = buildTemplateContext(fullInput);
  const out = renderTemplate(
    "Věc: {{case.name}} ({{ case.fileNumber }}) — klient {{client.name}}",
    ctx,
  );
  assert.equal(
    out,
    "Věc: Žaloba na zaplacení (ABC-001/2026) — klient ABC s.r.o.",
  );
});

test("renderTemplate: present-but-empty token renders empty (not a marker)", () => {
  const ctx = buildTemplateContext({
    ...fullInput,
    fileNumber: null,
    client: null,
  });
  assert.equal(renderTemplate("[{{case.fileNumber}}]", ctx), "[]");
  assert.equal(renderTemplate("[{{client.ico}}]", ctx), "[]");
});

test("renderTemplate: unknown/misspelled token kept visible as marker", () => {
  const ctx = buildTemplateContext(fullInput);
  assert.equal(
    renderTemplate("Pozdrav {{client.nme}} a {{unknown}}", ctx),
    "Pozdrav [doplňte: client.nme] a [doplňte: unknown]",
  );
});

test("renderTemplate: today is formatted as cs-CZ UTC date", () => {
  const ctx = buildTemplateContext(fullInput);
  assert.equal(renderTemplate("V Praze dne {{today}}", ctx), "V Praze dne 25. 06. 2026");
});

test("renderTemplate: no tokens → unchanged; repeated tokens all replaced", () => {
  const ctx = buildTemplateContext(fullInput);
  assert.equal(renderTemplate("Bez tokenů.", ctx), "Bez tokenů.");
  assert.equal(
    renderTemplate("{{org.name}} / {{org.name}}", ctx),
    "Demo advokátní kancelář / Demo advokátní kancelář",
  );
});

test("renderTemplate: tokens at the very start and end of the string", () => {
  const ctx = buildTemplateContext(fullInput);
  assert.equal(
    renderTemplate("{{client.name}} … {{case.name}}", ctx),
    "ABC s.r.o. … Žaloba na zaplacení",
  );
});

test("renderTemplate: adjacent tokens with no separator are all replaced", () => {
  const ctx = buildTemplateContext(fullInput);
  assert.equal(
    renderTemplate("{{client.ico}}{{client.dic}}", ctx),
    "12345678CZ12345678",
  );
});

test("renderTemplate: multiline body preserves newlines and substitutes per line", () => {
  const ctx = buildTemplateContext(fullInput);
  const body = "Věc: {{case.name}}\nKlient: {{client.name}}\nV Praze dne {{today}}";
  assert.equal(
    renderTemplate(body, ctx),
    "Věc: Žaloba na zaplacení\nKlient: ABC s.r.o.\nV Praze dne 25. 06. 2026",
  );
});

test("renderTemplate: empty body → empty output", () => {
  const ctx = buildTemplateContext(fullInput);
  assert.equal(renderTemplate("", ctx), "");
});

// --- buildTemplateContext ---------------------------------------------------

test("buildTemplateContext: maps every supported placeholder key", () => {
  const ctx = buildTemplateContext(fullInput);
  for (const placeholder of SUPPORTED_PLACEHOLDERS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ctx, placeholder.key),
      `context missing key ${placeholder.key}`,
    );
  }
});

test("buildTemplateContext: null client/counterparty → empty strings, not undefined", () => {
  const ctx = buildTemplateContext({
    ...fullInput,
    client: null,
    counterparty: null,
    lawyerName: null,
    projectName: null,
  });
  assert.equal(ctx["client.name"], "");
  assert.equal(ctx["counterparty.ico"], "");
  assert.equal(ctx["lawyer.name"], "");
  assert.equal(ctx["project.name"], "");
  // org.name and today are always present and non-empty.
  assert.equal(ctx["org.name"], "Demo advokátní kancelář");
  assert.equal(ctx.today, "25. 06. 2026");
});

test("buildTemplateContext: today is pinned to UTC (no local-timezone day rollover)", () => {
  // A late-UTC-day instant must not roll to the next day under a positive-offset
  // local zone. This guards the hardcoded timeZone:"UTC" against regression.
  const ctx = buildTemplateContext({
    ...fullInput,
    today: new Date("2026-06-25T23:30:00.000Z"),
  });
  assert.equal(ctx.today, "25. 06. 2026");
});
