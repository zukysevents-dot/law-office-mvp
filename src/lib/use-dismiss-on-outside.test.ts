import assert from "node:assert/strict";
import { test } from "node:test";

import { isOutside } from "./use-dismiss-on-outside";

// Minimal stand-ins for DOM nodes: a panel "contains" the nodes in its set.
function panel(...nodes: object[]) {
  const set = new Set(nodes);
  return { contains: (node: Node | null) => node !== null && set.has(node) };
}

const inside = {} as Node;
const elsewhere = {} as Node;

test("isOutside: klik do panelu není venku", () => {
  assert.equal(isOutside(inside, [panel(inside)]), false);
});

test("isOutside: klik mimo všechny panely je venku", () => {
  assert.equal(isOutside(elsewhere, [panel(inside)]), true);
});

test("isOutside: stačí, když cíl leží v jednom z více panelů", () => {
  assert.equal(isOutside(inside, [panel(elsewhere), panel(inside)]), false);
});

test("isOutside: chybějící panely se ignorují, null cíl je venku", () => {
  assert.equal(isOutside(inside, [null, undefined]), true);
  assert.equal(isOutside(null, [panel(inside)]), true);
  assert.equal(isOutside(inside, []), true);
});
