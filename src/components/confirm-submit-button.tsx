"use client";

import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";

/**
 * Danger submit button that asks for confirmation in an in-app dialog first.
 * Render it inside the <form> it should submit.
 */
export function ConfirmSubmitButton({
  children,
  message,
  pendingLabel,
}: {
  children: React.ReactNode;
  message: string;
  pendingLabel?: string;
}) {
  return (
    <ConfirmDialogButton
      label={children}
      message={message}
      variant="danger"
      pendingLabel={pendingLabel}
    />
  );
}
