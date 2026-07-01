"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Loading indicator at the cursor (revize „nabíhací kolečko místo myši").
 * After a click on an internal link, a small spinner — the office logo with a
 * pixel orbiting around it — follows the mouse until the new route commits, so
 * the user immediately sees the click registered. Pure client UX; no data.
 */
export function NavigationCursor() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  function moveTo(x: number, y: number) {
    const element = elementRef.current;
    if (element) {
      element.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  // Follow the cursor by mutating the transform directly — no React re-render.
  useEffect(() => {
    const onMove = (event: MouseEvent) => moveTo(event.clientX, event.clientY);
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Show on a plain left-click of an internal, same-tab link.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (!anchor || anchor.target === "_blank") {
        return;
      }
      const href = anchor.getAttribute("href") ?? "";
      // Internal navigation to a different location only (skip #anchors, external).
      if (!href.startsWith("/") || href.startsWith("/#")) {
        return;
      }
      moveTo(event.clientX, event.clientY);
      setActive(true);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      // Safety net so the spinner can never get stuck (same-page nav, error…).
      timeoutRef.current = window.setTimeout(() => setActive(false), 6000);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // New route committed → hide. Adjust state during render (the sanctioned
  // "reset on changed input" pattern) instead of an effect. The safety timeout
  // still covers same-page navigations that don't change the key.
  const navKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const [seenKey, setSeenKey] = useState(navKey);
  if (navKey !== seenKey) {
    setSeenKey(navKey);
    setActive(false);
  }

  // Hide the OS cursor while loading so the spinner truly replaces it.
  useEffect(() => {
    document.body.classList.toggle("nav-loading", active);
    return () => document.body.classList.remove("nav-loading");
  }, [active]);

  return (
    <div
      ref={elementRef}
      aria-hidden="true"
      className={`pointer-events-none fixed left-0 top-0 z-[9999] transition-opacity duration-150 ${
        active ? "opacity-100" : "opacity-0"
      }`}
      style={{ willChange: "transform" }}
    >
      <div className="relative h-7 w-7 -translate-x-1/2 -translate-y-1/2">
        {/* dráha */}
        <div className="absolute inset-0 rounded-full border border-[#072924]/20" />
        {/* obíhající pixel */}
        <div
          className="absolute inset-0 animate-spin"
          style={{ animationDuration: "0.9s" }}
        >
          <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#072924] shadow" />
        </div>
        {/* logo uprostřed */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-square.jpeg"
          alt=""
          className="absolute inset-[5px] h-[18px] w-[18px] rounded-full object-cover"
        />
      </div>
    </div>
  );
}
