"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { NAVIGATION_START_EVENT } from "@/lib/navigation-events";

// Show the bar only when a navigation is not instant, so fast transitions
// don't flash. A safety timeout guarantees it can never get stuck.
const SHOW_DELAY_MS = 150;
const SAFETY_TIMEOUT_MS = 10_000;

/*
 * Why an external store and not useState:
 * onRouterTransitionStart (src/instrumentation-client.ts) runs INSIDE the
 * router's startTransition. A setState called from there joins the navigation
 * transition and only commits together with the new route — i.e. exactly
 * when the bar should already disappear — so the bar never showed up.
 * Updates coming from useSyncExternalStore are always rendered synchronously
 * (React de-opts them out of the transition), so the bar appears while the
 * old page is still on screen and the next route is loading.
 */
type ProgressState = { pending: boolean; visible: boolean };

const IDLE: ProgressState = { pending: false, visible: false };
let state: ProgressState = IDLE;
let showTimer: number | null = null;
let safetyTimer: number | null = null;
const listeners = new Set<() => void>();

function setState(next: ProgressState) {
  if (next.pending === state.pending && next.visible === state.visible) {
    return;
  }
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

function clearTimers() {
  if (showTimer !== null) window.clearTimeout(showTimer);
  if (safetyTimer !== null) window.clearTimeout(safetyTimer);
  showTimer = null;
  safetyTimer = null;
}

function finishNavigation() {
  clearTimers();
  setState(IDLE);
}

function startNavigation(url: string | undefined) {
  try {
    const target = new URL(url ?? "", window.location.href);
    const current = new URL(window.location.href);
    if (
      target.pathname === current.pathname &&
      target.search === current.search
    ) {
      // Same-URL navigation (e.g. hash change): nothing to wait for.
      return;
    }
  } catch {
    // Unparseable URL: still show feedback, the safety timeout ends it.
  }
  clearTimers();
  setState({ pending: true, visible: false });
  showTimer = window.setTimeout(() => {
    showTimer = null;
    if (state.pending) setState({ pending: true, visible: true });
  }, SHOW_DELAY_MS);
  safetyTimer = window.setTimeout(finishNavigation, SAFETY_TIMEOUT_MS);
}

function onStartEvent(event: Event) {
  const detail = (event as CustomEvent<{ url?: string }>).detail;
  startNavigation(detail?.url);
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener(NAVIGATION_START_EVENT, onStartEvent);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener(NAVIGATION_START_EVENT, onStartEvent);
      finishNavigation();
    }
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => IDLE;

/**
 * Thin progress bar at the top of the viewport during client navigations —
 * link clicks as well as programmatic router.push (row click, command
 * palette). It replaces the route-level loading.tsx skeletons, which were
 * removed because on Next 16.2.9 they made router refreshes (server-action
 * revalidation) hang until a manual reload — see tests/e2e/README.md.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending, visible } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // New route committed → finish.
  const navKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  useEffect(() => {
    finishNavigation();
  }, [navKey]);

  if (!pending || !visible) {
    return null;
  }

  return (
    <div
      role="progressbar"
      aria-label="Načítání stránky"
      aria-busy="true"
      data-nav-progress="active"
      className="pointer-events-none fixed inset-x-0 top-0 z-[10000] h-[3px] overflow-hidden bg-[#17A2A2]/20"
    >
      <div className="iv-nav-progress-bar h-full w-2/5 bg-[#17A2A2]" />
    </div>
  );
}
