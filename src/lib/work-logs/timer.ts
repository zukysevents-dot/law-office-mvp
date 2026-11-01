// Stav plovoucích stopek (FloatingTimer). Ukládá se do localStorage, aby
// přežil navigaci i reload. Pozastavený čas se nezapočítává: při pauze se
// dosud naměřený čas přičte do `accumulatedMs` a běh se zastaví, při
// pokračování se začne měřit znovu od aktuálního okamžiku.

export const TIMER_STORAGE_KEY = "wl-timer";

export type TimerState =
  | { status: "running"; startedAt: number; accumulatedMs: number }
  | { status: "paused"; accumulatedMs: number };

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Přečte uložený stav. Starší verze ukládala jen časové razítko spuštění
 * (číslo) — to se načte jako běžící stopky bez pauzy. Cokoli neplatného
 * znamená „stopky neběží“.
 */
export function parseTimerState(raw: string | null | undefined): TimerState | null {
  if (!raw) {
    return null;
  }
  const legacy = Number(raw);
  if (Number.isFinite(legacy) && legacy > 0 && /^\d+$/.test(raw.trim())) {
    return { status: "running", startedAt: legacy, accumulatedMs: 0 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const value = parsed as Record<string, unknown>;
  const accumulatedMs = finiteNonNegative(value.accumulatedMs) ? value.accumulatedMs : 0;
  if (value.status === "running" && finiteNonNegative(value.startedAt) && value.startedAt > 0) {
    return { status: "running", startedAt: value.startedAt, accumulatedMs };
  }
  if (value.status === "paused") {
    return { status: "paused", accumulatedMs };
  }
  return null;
}

export function serializeTimerState(state: TimerState): string {
  return JSON.stringify(state);
}

export function startTimer(now: number): TimerState {
  return { status: "running", startedAt: now, accumulatedMs: 0 };
}

/** Naměřený čas bez pauz (ms). Hodiny posunuté zpět nezpůsobí záporný čas. */
export function timerElapsedMs(state: TimerState, now: number): number {
  if (state.status === "paused") {
    return state.accumulatedMs;
  }
  return state.accumulatedMs + Math.max(0, now - state.startedAt);
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.status === "paused") {
    return state;
  }
  return { status: "paused", accumulatedMs: timerElapsedMs(state, now) };
}

export function resumeTimer(state: TimerState, now: number): TimerState {
  if (state.status === "running") {
    return state;
  }
  return { status: "running", startedAt: now, accumulatedMs: state.accumulatedMs };
}
