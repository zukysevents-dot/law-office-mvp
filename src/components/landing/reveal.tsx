"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Wraps server-rendered children and fades+slides them in once they enter the
 * viewport (one-shot). Children are always in the DOM, so SSR/SEO are intact;
 * this only toggles a class. Honors prefers-reduced-motion (shows instantly).
 * The hidden initial state lives in globals.css (.reveal), with a no-JS and a
 * reduced-motion fallback that force visibility.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  variant = "up",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** "up" = fade+slide, "scale" = fade+slide+settle (for large frames). */
  variant?: "up" | "scale";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Signal to the landing's inline fail-open script that the client bundle
    // hydrated — the reveal-hiding CSS stays active only when this runs.
    el.closest(".landing-root")?.classList.add("js-live");

    // Fail open: without IntersectionObserver (old/exotic browsers) show the
    // content immediately instead of throwing from the effect — an error here
    // would bubble to the root error boundary and blank the whole landing.
    // Direct DOM class (not setState) keeps the effect render-free.
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }

    // Reduced motion is handled in CSS (globals.css forces .reveal visible),
    // so the observer can run unconditionally; the animation is suppressed there.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "landing-reveal",
        variant === "scale" && "landing-reveal--scale",
        visible && "is-visible",
        className,
      )}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
