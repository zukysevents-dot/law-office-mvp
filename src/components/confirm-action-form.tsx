"use client";

import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type ConfirmActionFormProps = {
  action: () => Promise<void>;
  label: string;
  message: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  pendingLabel?: string;
};

/** A form with a single action that must be confirmed in an in-app dialog. */
export function ConfirmActionForm({
  action,
  label,
  message,
  variant = "primary",
  className,
  pendingLabel,
}: ConfirmActionFormProps) {
  return (
    <form action={action} className={cn("inline-flex", className)}>
      <ConfirmDialogButton
        label={label}
        message={message}
        variant={variant}
        pendingLabel={pendingLabel}
      />
    </form>
  );
}
