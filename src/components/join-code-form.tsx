"use client";

import { useActionState } from "react";

import {
  createJoinCode,
  type CreateJoinCodeState,
} from "@/app/actions/organizations";
import { Field, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";

const initialState: CreateJoinCodeState = { ok: false };

export function JoinCodeForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, pending] = useActionState(
    createJoinCode,
    initialState,
  );

  return (
    <div className="grid gap-4">
      {state.ok && state.code ? (
        <div role="status" className="rounded-md border border-[#17A2A2] bg-[#17A2A2]/25 p-4">
          <p className="text-sm font-semibold text-[#0e1822]">
            Kód „{state.label}“ byl vytvořen
          </p>
          <p className="mt-1 text-sm text-[#0e1822]">
            Zkopírujte si jej teď — z bezpečnostních důvodů se už znovu nezobrazí.
          </p>
          <p className="mt-3 select-all rounded-md border border-[#17A2A2] bg-white px-3 py-2 text-center font-mono text-lg tracking-widest text-[#0e1822]">
            {state.code}
          </p>
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="organizationId" value={organizationId} />
        <Field label="Název kódu">
          <TextInput
            name="label"
            placeholder="Např. Onboarding červen 2026"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Maximální počet použití (volitelné)">
            <TextInput name="maxUses" type="number" min="1" step="1" />
          </Field>
          <Field label="Platnost do (volitelné)">
            <TextInput name="expiresAt" type="date" />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Vytvářím…" : "Vytvořit registrační kód"}
          </Button>
        </div>
      </form>
    </div>
  );
}
