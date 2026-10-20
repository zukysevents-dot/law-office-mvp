"use client";

import { useActionState } from "react";

import { createUser, type CreateUserState } from "@/app/actions/users";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/generated/prisma/enums";
import { options, userRoleLabels } from "@/lib/labels";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { cn } from "@/lib/utils";

const initialState: CreateUserState = { ok: false };

export function InvitationBanner({
  tone,
  message,
}: {
  tone?: "success" | "warning" | "error";
  message: string;
}) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-md border px-3 py-2 text-sm leading-6",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
        (tone === "error" || !tone) && "border-red-200 bg-red-50 text-red-800",
      )}
    >
      {message}
    </p>
  );
}

/**
 * "Nový uživatel" form. Validation errors stay in the form; on success the
 * new user appears in the table right away and the banner says whether the
 * welcome e-mail went out (and if not, why).
 */
export function CreateUserForm() {
  const [state, formAction] = useActionState(createUser, initialState);
  const values = state.ok ? undefined : state.values;

  return (
    <div className="grid gap-4">
      {state.ok && state.message ? (
        <InvitationBanner tone={state.tone} message={state.message} />
      ) : null}
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      {/* key: re-mount after each submit so defaultValues reflect the echo. */}
      <form
        key={state.submittedAt ?? "initial"}
        action={formAction}
        className="grid gap-4"
      >
        <Field label="Jméno">
          <TextInput name="name" required defaultValue={values?.name} />
        </Field>
        <Field label="E-mail">
          <TextInput
            name="email"
            type="email"
            required
            defaultValue={values?.email}
          />
        </Field>
        <Field label={`Počáteční heslo (min. ${MIN_PASSWORD_LENGTH} znaků)`}>
          <TextInput
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>
        <Field label="Role">
          <SelectInput name="role" defaultValue={values?.role ?? UserRole.LAWYER}>
            {options.userRoles.map((role) => (
              <option key={role} value={role}>
                {userRoleLabels[role]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Microsoft ID">
          <TextInput name="microsoftId" defaultValue={values?.microsoftId} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <input
            type="checkbox"
            name="active"
            defaultChecked={values?.active ?? true}
            className="h-4 w-4 rounded border-stone-300 text-emerald-950"
          />
          Aktivní
        </label>
        <p className="text-xs leading-5 text-stone-600">
          Aktivnímu uživateli pošleme hned uvítací e-mail s odkazem pro
          nastavení vlastního hesla (platí 72 hodin). Heslo v e-mailu není.
        </p>
        <Button type="submit" pendingLabel="Vytvářím…">
          Vytvořit uživatele
        </Button>
      </form>
    </div>
  );
}
