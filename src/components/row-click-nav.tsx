"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const INTERACTIVE_SELECTOR = "a, button, input, select, textarea, label";

/**
 * Makes server-rendered table rows carrying `data-href` navigable by a single
 * click. Interactive controls inside the row keep their native behaviour.
 * Rows remain keyboard accessible when rendered with tabIndex={0}.
 */
export function RowClickNav({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const container = ref.current;
    if (!container) {
      return;
    }

    function navigateFrom(target: HTMLElement | null) {
      const row = target?.closest<HTMLElement>("[data-href]");
      const href = row?.getAttribute("data-href");
      if (href) {
        router.push(href);
      }
    }

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest(INTERACTIVE_SELECTOR)) {
        return;
      }
      navigateFrom(target);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!target?.matches("[data-href]")) {
        return;
      }
      event.preventDefault();
      navigateFrom(target);
    }

    container.addEventListener("click", onClick);
    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("click", onClick);
      container.removeEventListener("keydown", onKeyDown);
    };
  }, [router]);

  return <div ref={ref}>{children}</div>;
}
