"use client";

import { useEffect, useState } from "react";
import { Play, Square, Timer, X } from "lucide-react";

const STORAGE_KEY = "wl-timer";

function readStart(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
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

// A stopwatch that survives navigation by keeping the start timestamp in
// localStorage (the app-shell layout persists across client navigations; a full
// reload re-reads it). Stopping rounds elapsed time to the nearest quarter hour
// and opens the work-log form pre-filled via ?hours — the single most repeated
// daily action, with zero manual time math.
export function FloatingTimer({
  incrementMinutes = 15,
}: {
  incrementMinutes?: number;
}) {
  // ready guards against a hydration mismatch: localStorage is client-only, so
  // both the server and the first client render show nothing.
  const [state, setState] = useState<{ ready: boolean; startedAt: number | null }>({
    ready: false,
    startedAt: null,
  });
  const [now, setNow] = useState(0);

  useEffect(() => {
    // One-time read of the persisted timer after mount.
    /* eslint-disable react-hooks/set-state-in-effect */
    setState({ ready: true, startedAt: readStart() });
    setNow(Date.now());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (state.startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.startedAt]);

  if (!state.ready) return null;

  function start() {
    const ts = Date.now();
    try {
      window.localStorage.setItem(STORAGE_KEY, String(ts));
    } catch {
      // ignore storage failures — timer just won't survive navigation
    }
    setState({ ready: true, startedAt: ts });
    setNow(ts);
  }

  function clear() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setState({ ready: true, startedAt: null });
  }

  function stopAndLog() {
    if (state.startedAt === null) return;
    const elapsedH = (Date.now() - state.startedAt) / 3_600_000;
    const incrementHours = incrementMinutes === 6 ? 0.1 : 0.25;
    const hours = Math.max(
      incrementHours,
      Math.round(elapsedH / incrementHours) * incrementHours,
    );
    clear();
    window.location.href = `/work-logs?new=1&hours=${hours}`;
  }

  if (state.startedAt === null) {
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

  return (
    <div className="no-print fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-[#0e1822] py-2 pl-4 pr-2 text-white shadow-lg">
      <span className="flex items-center gap-2 tabular-nums">
        <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
        {formatElapsed(now - state.startedAt)}
      </span>
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
