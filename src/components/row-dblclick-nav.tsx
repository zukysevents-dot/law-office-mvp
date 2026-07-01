"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Wraps a table so a double‑click ANYWHERE on a row (that carries `data-href`)
 * navigates to that row's detail — the lawyers' revision asked for "dvojklik
 * kamkoli na úkol". Event delegation keeps the server‑rendered rows intact; a
 * double‑click on an interactive control (link/button/input/select) is ignored
 * so the inline status form still works.
 */
export function RowDblClickNav({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const container = ref.current;
    if (!container) {
      return;
    }
    const onDblClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest("a, button, input, select, textarea, label")) {
        return;
      }
      const row = target.closest<HTMLElement>("[data-href]");
      const href = row?.getAttribute("data-href");
      if (href) {
        router.push(href);
      }
    };
    container.addEventListener("dblclick", onDblClick);
    return () => container.removeEventListener("dblclick", onDblClick);
  }, [router]);

  return <div ref={ref}>{children}</div>;
}
