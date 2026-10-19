"use client";

import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from "react";

import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const sizeClasses = {
  sm: "m-auto w-[min(28rem,calc(100%-2rem))] max-h-[90dvh] rounded-xl border shadow-2xl",
  md: "m-auto w-[min(32rem,calc(100%-2rem))] max-h-[90dvh] rounded-xl border shadow-2xl",
  lg: "m-auto w-[min(48rem,calc(100%-2rem))] max-h-[90dvh] rounded-xl border shadow-2xl",
  xl: "m-auto w-[min(960px,calc(100%-2rem))] max-h-[90dvh] rounded-xl border shadow-2xl",
  full: "m-0 h-dvh max-h-none w-full max-w-none",
} as const;

export type DialogSize = keyof typeof sizeClasses;

function focusableIn(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

/**
 * The one modal pop-up primitive of the app (audit item "pop-up okna").
 * Built on the native <dialog> + showModal():
 * - renders in the browser's top layer and makes the rest of the page inert,
 *   so a click outside lands on the dialog's backdrop and can never activate
 *   the link / table row / button underneath;
 * - closes on a click on the backdrop, on Escape and with the visible "×"
 *   (aria-label "Zavřít" by default);
 * - moves focus inside on open, keeps Tab inside, returns focus to the opener;
 * - page scroll is locked by `html:has(dialog[open]:modal)` in globals.css.
 *
 * React state stays the source of truth: every close path calls
 * `onOpenChange(false)`; the parent decides. Children are mounted only while
 * open (so e.g. a confirm button inside a <form> can't be the form's implicit
 * default button while hidden).
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  size = "md",
  closeLabel = "Zavřít",
  initialFocusRef,
  header,
  panelId,
  className,
  bodyClassName,
  tone = "light",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name of the dialog (rendered as its h2). */
  title: ReactNode;
  description?: ReactNode;
  /** Keep the title for screen readers only. */
  hideTitle?: boolean;
  size?: DialogSize;
  closeLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Custom visible header content (e.g. a logo); the title stays as the name. */
  header?: ReactNode;
  /** id of the inner panel (e.g. for aria-controls on the opener). */
  panelId?: string;
  /** Extra classes for the <dialog> element itself. */
  className?: string;
  bodyClassName?: string;
  /** "dark" = the app's deep navy chrome (mobile menu). */
  tone?: "light" | "dark";
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pointerDownOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  // Latest values for the native event handlers.
  const openRef = useRef(open);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    openRef.current = open;
    onOpenChangeRef.current = onOpenChange;
  });

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      const active = document.activeElement;
      openerRef.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
      dialog.showModal();
      const target =
        initialFocusRef?.current ??
        bodyRef.current?.querySelector<HTMLElement>("[autofocus]") ??
        (bodyRef.current ? focusableIn(bodyRef.current)[0] : undefined) ??
        closeButtonRef.current;
      target?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocusRef]);

  // Closing while unmounting (e.g. navigation away) must not leave the page inert.
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  function requestClose() {
    if (openRef.current) {
      onOpenChangeRef.current(false);
    }
  }

  function handleNativeClose() {
    // Fallback focus return: the browser restores focus itself, but only when
    // focus is still in (or was lost from) the dialog — never steal it from
    // another dialog opened in the same step (menu → search).
    const opener = openerRef.current;
    openerRef.current = null;
    const active = document.activeElement;
    const lost =
      !active ||
      active === document.body ||
      Boolean(dialogRef.current?.contains(active));
    if (opener && opener.isConnected && lost) {
      opener.focus();
    }
    // Closed natively (Escape without user activation, form method=dialog…)
    // while the parent still thinks it's open → tell the parent.
    requestClose();
  }

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    requestClose();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDialogElement>) {
    pointerDownOnBackdrop.current = event.target === dialogRef.current;
  }

  function handleClick(event: ReactMouseEvent<HTMLDialogElement>) {
    // The panel fills the whole <dialog> box (p-0), so the only way to hit the
    // <dialog> element itself is its ::backdrop. Requiring both pointerdown and
    // click there keeps a text selection dragged outside from closing it.
    const onBackdrop = event.target === dialogRef.current;
    if (onBackdrop && pointerDownOnBackdrop.current) {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
    }
    pointerDownOnBackdrop.current = false;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    // One Escape always closes — even from a filled type="search" field,
    // where Chrome would otherwise spend the first Escape on clearing it.
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }
    const items = focusableIn(dialogRef.current);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "iv-dialog overflow-hidden p-0",
        tone === "dark"
          ? "border-white/10 bg-[var(--iv-deep)] text-[#dbe7ec]"
          : "border-[#dce4e8] bg-white text-[#0e1822]",
        sizeClasses[size],
        className,
      )}
    >
      {open ? (
        <div
          id={panelId}
          className={cn(
            "flex flex-col",
            size === "full" ? "h-full" : "max-h-[90dvh]",
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 px-4 py-2 sm:px-5",
              header
                ? ""
                : tone === "dark"
                  ? "border-b border-white/10"
                  : "border-b border-[#dce4e8]",
            )}
          >
            {header ? (
              <>
                <h2 id={titleId} className="sr-only">
                  {title}
                </h2>
                <div className="min-w-0 flex-1">{header}</div>
              </>
            ) : (
              <h2
                id={titleId}
                className={cn(
                  "min-w-0 text-base font-semibold text-current sm:text-lg",
                  hideTitle && "sr-only",
                )}
              >
                {title}
              </h2>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={requestClose}
              aria-label={closeLabel}
              title={closeLabel}
              className="-mr-2 ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-current opacity-80 transition hover:bg-current/10 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17A2A2]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {description ? (
            <p
              id={descriptionId}
              className="px-4 pt-3 text-sm leading-6 text-[#566673] sm:px-5"
            >
              {description}
            </p>
          ) : null}
          <div
            ref={bodyRef}
            className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}
          >
            {children}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

export { FormDoneWatcher } from "./form-done-watcher";
