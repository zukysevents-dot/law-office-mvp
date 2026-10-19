"use client";

import { useActionState } from "react";

import {
  setPasswordWithInvitation,
  type SetPasswordState,
} from "@/app/actions/password-setup";
import { Field, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

const initialState: SetPasswordState = {};

export function SetPasswordForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, formAction] = useActionState(
    setPasswordWithInvitation,
    initialState,
  );

  if (state.invalid) {
    return (
      <p
        role="alert"
        className="rounded-md bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
      >
        {state.error}
      </p>
    );
  }

  return (
    <>
      <p className="mb-5 text-center text-sm text-[var(--iv-muted)]">
        Nastavujete heslo pro{" "}
        <strong className="font-semibold text-[var(--iv-ink)]">{email}</strong>
      </p>
      {state.error ? (
        <p
          role="alert"
          className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="token" value={token} />
        {/* Hidden username helps password managers store the new credential. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <Field label={`Nové heslo (min. ${MIN_PASSWORD_LENGTH} znaků)`}>
          <TextInput
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>
        <Field label="Nové heslo znovu">
          <TextInput
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>
        <Button type="submit" className="mt-2 w-full" pendingLabel="Ukládám…">
          Nastavit heslo
        </Button>
      </form>
    </>
  );
}
