"use client";

import { useEffect, useRef } from "react";

type ContainsTarget = { contains(node: Node | null): boolean };

/**
 * Pure helper: is `target` outside every given panel? Missing panels (null /
 * undefined) are ignored. A null target counts as outside.
 */
export function isOutside(
  target: Node | null,
  panels: ReadonlyArray<ContainsTarget | null | undefined>,
): boolean {
  if (!target) {
    return true;
  }
  return !panels.some((panel) => panel?.contains(target));
}

/**
 * Light-dismiss for NON-modal overlays we can't render as a native <dialog>
 * (third-party popovers such as FullCalendar's "+N more", the landing page's
 * collapsible menu). Modal pop-ups use components/ui/dialog.tsx instead.
 *
 * - A pointer press that starts outside the open overlay closes it on the
 *   following click, and that click is swallowed (capture phase,
 *   preventDefault + stopPropagation), so the link/row/button under the
 *   pointer is NOT activated — the outside click only closes.
 * - Escape closes it as well.
 *
 * `getPanels` returns the overlay element(s); when it returns nothing (or
 * `active` is false) the overlay counts as closed and nothing is intercepted.
 * `getIgnored` returns elements (e.g. the toggle button) whose clicks are left
 * alone so they can toggle the overlay themselves.
 */
export function useDismissOnOutside({
  active,
  getPanels,
  getIgnored,
  onDismiss,
}: {
  active: boolean;
  getPanels: () => ReadonlyArray<Element | null | undefined>;
  getIgnored?: () => ReadonlyArray<Element | null | undefined>;
  onDismiss: (reason: "outside" | "escape") => void;
}) {
  const latest = useRef({ active, getPanels, getIgnored, onDismiss });
  useEffect(() => {
    latest.current = { active, getPanels, getIgnored, onDismiss };
  });

  useEffect(() => {
    // Set on a pointer press outside an open overlay; consumed by the click.
    // Recorded at pointerdown because some overlays (FullCalendar) close
    // themselves on mousedown — by the time the click fires they're gone.
    let swallowNextClick = false;

    const isOpen = () => {
      const { active: isActive, getPanels: panels } = latest.current;
      return isActive && panels().some(Boolean);
    };

    const onPointerDown = (event: PointerEvent) => {
      swallowNextClick = false;
      if (!isOpen()) {
        return;
      }
      const target = event.target as Node | null;
      const { getPanels: panels, getIgnored: ignored } = latest.current;
      if (
        isOutside(target, panels()) &&
        isOutside(target, ignored?.() ?? [])
      ) {
        swallowNextClick = true;
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!swallowNextClick) {
        return;
      }
      swallowNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      latest.current.onDismiss("outside");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen()) {
        latest.current.onDismiss("escape");
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
