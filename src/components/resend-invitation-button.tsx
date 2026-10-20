"use client";

import { useActionState } from "react";

import {
  resendUserInvitation,
  type ResendInvitationState,
} from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: ResendInvitationState = { ok: false };

/** "Znovu poslat pozvánku" for one row of the users table + inline result. */
export function ResendInvitationButton({
  userId,
  userName,
  disabled,
  disabledReason,
}: {
  userId: string;
  userName: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction] = useActionState(
    resendUserInvitation,
    initialState,
  );

  return (
    <form action={formAction} className="grid max-w-xs gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <Button
        type="submit"
        variant="ghost"
        className="h-9 px-3 text-xs"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        aria-label={`Znovu poslat pozvánku: ${userName}`}
        pendingLabel="Odesílám…"
      >
        Znovu poslat pozvánku
      </Button>
      {state.message ? (
        <p
          key={state.submittedAt}
          role="status"
          className={cn(
            "whitespace-normal text-xs leading-5",
            state.tone === "success" && "text-emerald-800",
            state.tone === "warning" && "text-amber-900",
            state.tone === "error" && "text-red-800",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
