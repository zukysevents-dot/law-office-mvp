"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NAVIGATION_START_EVENT } from "@/lib/navigation-events";

// Show the bar only when a navigation is not instant, so fast transitions
// don't flash. A safety timeout guarantees it can never get stuck.
const SHOW_DELAY_MS = 150;
const SAFETY_TIMEOUT_MS = 10_000;

/**
 * Thin progress bar at the top of the viewport during client navigations.
 * It replaces the route-level loading.tsx skeletons, which were removed
 * because on Next 16.2.9 they made router refreshes (server-action
 * revalidation) hang until a manual reload — see tests/e2e/README.md.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<number | null>(null);
  const safetyTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
      showTimer.current = null;
      safetyTimer.current = null;
    };

    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      try {
        const target = new URL(detail?.url ?? "", window.location.href);
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
      setPending(true);
      showTimer.current = window.setTimeout(
        () => setVisible(true),
        SHOW_DELAY_MS,
      );
      safetyTimer.current = window.setTimeout(() => {
        setPending(false);
        setVisible(false);
      }, SAFETY_TIMEOUT_MS);
    };

    window.addEventListener(NAVIGATION_START_EVENT, onStart);
    return () => {
      window.removeEventListener(NAVIGATION_START_EVENT, onStart);
      clearTimers();
    };
  }, []);

  // New route committed → finish. Adjusting state during render (the
  // sanctioned "reset on changed input" pattern) instead of in an effect.
  const navKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const [seenKey, setSeenKey] = useState(navKey);
  if (navKey !== seenKey) {
    setSeenKey(navKey);
    setPending(false);
    setVisible(false);
  }

  // Cancel the delayed "show" once the navigation has finished.
  useEffect(() => {
    if (!pending) {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
      showTimer.current = null;
      safetyTimer.current = null;
    }
  }, [pending]);

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
