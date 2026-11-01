"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Square, Timer, X } from "lucide-react";

import {
  parseTimerState,
  pauseTimer,
  resumeTimer,
  serializeTimerState,
  startTimer,
  TIMER_STORAGE_KEY,
  timerElapsedMs,
  type TimerState,
} from "@/lib/work-logs/timer";
import { roundHoursToIncrement } from "@/lib/work-logs/time-rounding";

function readTimer(): TimerState | null {
  try {
    return parseTimerState(window.localStorage.getItem(TIMER_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeTimer(state: TimerState | null) {
  try {
    if (state) {
      window.localStorage.setItem(TIMER_STORAGE_KEY, serializeTimerState(state));
    } else {
      window.localStorage.removeItem(TIMER_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures — timer just won't survive navigation
  }
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// A stopwatch that survives navigation by keeping its state in localStorage
// (the app-shell layout persists across client navigations; a full reload
// re-reads it). It can be paused and resumed — paused time is not counted
// (src/lib/work-logs/timer.ts). Stopping rounds the measured time to the
// office's billing increment and opens the work-log form pre-filled via
// ?hours — the single most repeated daily action, with zero manual time math.
export function FloatingTimer({
  incrementMinutes = 15,
}: {
  incrementMinutes?: number;
}) {
  // ready guards against a hydration mismatch: localStorage is client-only, so
  // both the server and the first client render show nothing.
  const [state, setState] = useState<{ ready: boolean; timer: TimerState | null }>({
    ready: false,
    timer: null,
  });
  const [now, setNow] = useState(0);

  useEffect(() => {
    // One-time read of the persisted timer after mount.
    /* eslint-disable react-hooks/set-state-in-effect */
    setState({ ready: true, timer: readTimer() });
    setNow(Date.now());
    /* eslint-enable react-hooks/set-state-in-effect */

    // Pauza / pokračování v jiné záložce se projeví i tady.
    function onStorage(event: StorageEvent) {
      if (event.key === TIMER_STORAGE_KEY || event.key === null) {
        setState({ ready: true, timer: readTimer() });
        setNow(Date.now());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const running = state.timer?.status === "running";
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  if (!state.ready) return null;

  function update(timer: TimerState | null) {
    writeTimer(timer);
    setState({ ready: true, timer });
    setNow(Date.now());
  }

  function start() {
    update(startTimer(Date.now()));
  }

  function pause() {
    if (state.timer) update(pauseTimer(state.timer, Date.now()));
  }

  function resume() {
    if (state.timer) update(resumeTimer(state.timer, Date.now()));
  }

  function clear() {
    update(null);
  }

  function stopAndLog() {
    if (!state.timer) return;
    const elapsedH = timerElapsedMs(state.timer, Date.now()) / 3_600_000;
    const hours = roundHoursToIncrement(elapsedH, incrementMinutes);
    clear();
    window.location.href = `/work-logs?new=1&hours=${hours}`;
  }

  if (state.timer === null) {
    return (
      <div className="no-print fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={start}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0e1822] px-4 text-sm font-medium text-white shadow-lg transition hover:bg-[#16242f]"
        >
          <Timer className="h-4 w-4" aria-hidden="true" />
          Stopky
        </button>
      </div>
    );
  }

  const paused = state.timer.status === "paused";

  return (
    <div
      data-testid="floating-timer"
      data-timer-status={state.timer.status}
      className="no-print fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-[#0e1822] py-2 pl-4 pr-2 text-white shadow-lg"
    >
      <span className="flex items-center gap-2 tabular-nums">
        {paused ? (
          <Pause className="h-3.5 w-3.5 fill-current text-amber-300" aria-hidden="true" />
        ) : (
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
        )}
        <span data-testid="floating-timer-elapsed">
          {formatElapsed(timerElapsedMs(state.timer, now))}
        </span>
        {paused ? (
          <span className="hidden text-xs font-medium text-amber-300 sm:inline">
            Pozastaveno
          </span>
        ) : null}
      </span>
      {paused ? (
        <button
          type="button"
          onClick={resume}
          aria-label="Pokračovat ve stopkách"
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-white transition hover:bg-white/10 sm:px-3"
        >
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          <span className="hidden sm:inline">Pokračovat</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={pause}
          aria-label="Pozastavit stopky"
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-white transition hover:bg-white/10 sm:px-3"
        >
          <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          <span className="hidden sm:inline">Pozastavit</span>
        </button>
      )}
      <button
        type="button"
        onClick={stopAndLog}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#17A2A2] px-3 text-xs font-medium text-[#0e1822] transition hover:bg-[#2dc6c2]"
      >
        <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
        Zastavit a vykázat
      </button>
      <button
        type="button"
        onClick={clear}
        aria-label="Zrušit stopky"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
