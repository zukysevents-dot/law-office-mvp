import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseTimerState,
  pauseTimer,
  resumeTimer,
  serializeTimerState,
  startTimer,
  timerElapsedMs,
} from "./timer";

const MIN = 60_000;

test("start a průběžný čas", () => {
  const state = startTimer(1_000);
  assert.deepEqual(state, { status: "running", startedAt: 1_000, accumulatedMs: 0 });
  assert.equal(timerElapsedMs(state, 1_000 + 5 * MIN), 5 * MIN);
});

test("pauza zastaví čas a doba pauzy se nezapočítá", () => {
  const t0 = 1_000_000;
  let state = startTimer(t0);
  state = pauseTimer(state, t0 + 10 * MIN);
  assert.equal(state.status, "paused");
  // 30 minut pauzy — čas stojí
  assert.equal(timerElapsedMs(state, t0 + 40 * MIN), 10 * MIN);
  state = resumeTimer(state, t0 + 40 * MIN);
  assert.equal(timerElapsedMs(state, t0 + 45 * MIN), 15 * MIN);
  // druhá pauza se sčítá s první částí
  state = pauseTimer(state, t0 + 50 * MIN);
  assert.equal(timerElapsedMs(state, t0 + 90 * MIN), 20 * MIN);
});

test("opakovaná pauza / pokračování nic nemění", () => {
  const paused = pauseTimer(startTimer(0), 5 * MIN);
  assert.deepEqual(pauseTimer(paused, 9 * MIN), paused);
  const running = startTimer(0);
  assert.deepEqual(resumeTimer(running, 9 * MIN), running);
});

test("hodiny posunuté zpět nedají záporný čas", () => {
  assert.equal(timerElapsedMs(startTimer(10_000), 5_000), 0);
});

test("stav přežije uložení a načtení (reload / navigace)", () => {
  const paused = pauseTimer(startTimer(1_000), 1_000 + 7 * MIN);
  assert.deepEqual(parseTimerState(serializeTimerState(paused)), paused);
  const running = resumeTimer(paused, 2_000_000);
  assert.deepEqual(parseTimerState(serializeTimerState(running)), running);
});

test("starší uložený formát (jen časové razítko) běží dál", () => {
  assert.deepEqual(parseTimerState("1700000000000"), {
    status: "running",
    startedAt: 1_700_000_000_000,
    accumulatedMs: 0,
  });
});

test("neplatný obsah úložiště znamená vypnuté stopky", () => {
  assert.equal(parseTimerState(null), null);
  assert.equal(parseTimerState(""), null);
  assert.equal(parseTimerState("{nope"), null);
  assert.equal(parseTimerState("[]"), null);
  assert.equal(parseTimerState('{"status":"running"}'), null);
  assert.equal(parseTimerState('{"status":"running","startedAt":-5}'), null);
  assert.equal(parseTimerState("-12"), null);
  assert.deepEqual(parseTimerState('{"status":"paused","accumulatedMs":"x"}'), {
    status: "paused",
    accumulatedMs: 0,
  });
});
