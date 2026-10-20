"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormDoneWatcher } from "@/components/ui/form-done-watcher";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/**
 * In-app replacement for window.confirm(): a trigger button that opens a
 * small modal with a cancel button ("Zrušit" by default) and the confirming submit button. MUST be
 * rendered inside the <form> it confirms — the dialog is a DOM descendant of
 * that form, so its confirm button submits the form (server action) and the
 * button shows the form's pending state. Backdrop click, Escape, "×" and
 * the cancel button only close the dialog; nothing is submitted.
 */
export function ConfirmDialogButton({
  label,
  message,
  title = "Potvrzení",
  confirmLabel,
  cancelLabel = "Zrušit",
  pendingLabel,
  variant = "danger",
  className,
}: {
  label: ReactNode;
  message: ReactNode;
  title?: string;
  /** Text of the confirming button; defaults to the trigger label. */
  confirmLabel?: ReactNode;
  /** Text of the closing button; override when "Zrušit" would be ambiguous. */
  cancelLabel?: string;
  pendingLabel?: string;
  variant?: Variant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={title} size="sm">
        <div className="grid gap-5 px-4 py-4 sm:px-5">
          <p className="text-sm leading-6 text-[#2c3a45]">{message}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {cancelLabel}
            </Button>
            <Button type="submit" variant={variant} pendingLabel={pendingLabel}>
              {confirmLabel ?? label}
            </Button>
          </div>
          <FormDoneWatcher onDone={() => setOpen(false)} />
        </div>
      </Dialog>
    </>
  );
}
