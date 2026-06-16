"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConfirmActionFormProps = {
  action: () => Promise<void>;
  label: string;
  message: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
};

export function ConfirmActionForm({
  action,
  label,
  message,
  variant = "primary",
  className,
}: ConfirmActionFormProps) {
  return (
    <form
      action={action}
      className={cn("inline-flex", className)}
      onSubmit={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}
