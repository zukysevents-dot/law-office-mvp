"use client";

import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Bare submit button for places that need their own styling (icon buttons,
 * header links, chips) but must still give pending feedback: while the parent
 * form's server action runs it is disabled, aria-busy and (optionally) shows a
 * spinner instead of its icon. For regular buttons use <Button> from ./button.
 */
export function SubmitButton({
  className,
  disabled,
  children,
  pendingLabel,
  spinnerClassName = "h-4 w-4",
  replaceChildrenWhilePending = false,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  pendingLabel?: string;
  spinnerClassName?: string;
  /** Swap the whole content for the spinner (icon-only buttons). */
  replaceChildrenWhilePending?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      {...props}
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={pending || undefined}
      className={cn("disabled:cursor-not-allowed disabled:opacity-60", className)}
    >
      {pending && replaceChildrenWhilePending ? (
        <LoaderCircle
          className={cn("shrink-0 animate-spin motion-reduce:animate-none", spinnerClassName)}
          aria-hidden="true"
        />
      ) : pending && pendingLabel ? (
        <>
          <LoaderCircle
            className={cn("shrink-0 animate-spin motion-reduce:animate-none", spinnerClassName)}
            aria-hidden="true"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
