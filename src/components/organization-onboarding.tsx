"use client";

import { useActionState } from "react";

import {
  createOwnOrganization,
  joinOrganization,
  type CreateOwnOrganizationState,
} from "@/app/actions/organizations";
import { Field, TextInput } from "@/components/form-field";
import { Button, ButtonLink } from "@/components/ui/button";

const initialState: CreateOwnOrganizationState = { ok: false };

// Post-registration step: found a new firm (and get its first invite code) or
// join an existing one with a code from its admin.
export function OrganizationOnboarding({ joinError }: { joinError?: string }) {
  const [state, createAction] = useActionState(
    createOwnOrganization,
    initialState,
  );

  if (state.ok && state.code) {
    return (
      <>
        <h1 className="text-center text-xl font-semibold text-[var(--iv-ink)]">
          Kancelář je založená
        </h1>
        <p className="mb-6 mt-1 text-center text-sm text-[var(--iv-muted)]">
          „{state.organizationName}“ je připravená a vy jste jejím správcem.
        </p>

        <div
          role="status"
          className="rounded-md border border-[#17A2A2] bg-[#17A2A2]/25 p-4"
        >
          <p className="text-sm font-semibold text-[#0e1822]">
            Registrační kód pro kolegy
          </p>
          <p className="mt-1 text-sm text-[#0e1822]">
            Pošlete ho kolegům — po registraci se jím připojí k vaší kanceláři.
            Zkopírujte si ho teď, znovu se nezobrazí. Další kódy vytvoříte
            v sekci Kancelář.
          </p>
          <p className="mt-3 select-all rounded-md border border-[#17A2A2] bg-white px-3 py-2 text-center font-mono text-lg tracking-widest text-[#0e1822]">
            {state.code}
          </p>
        </div>

        <ButtonLink href="/dashboard" className="mt-6 w-full">
          Pokračovat do aplikace
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <h1 className="text-center text-xl font-semibold text-[var(--iv-ink)]">
        Vaše kancelář
      </h1>
      <p className="mb-6 mt-1 text-center text-sm text-[var(--iv-muted)]">
        Založte novou kancelář, nebo se připojte ke stávající pomocí
        registračního kódu.
      </p>

      <section aria-labelledby="create-organization-heading">
        <h2
          id="create-organization-heading"
          className="mb-3 text-sm font-semibold text-[var(--iv-ink)]"
        >
          Založit novou kancelář
        </h2>
        {state.error ? (
          <p
            role="alert"
            className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {state.error}
          </p>
        ) : null}
        <form action={createAction} className="grid gap-4">
          <Field label="Název kanceláře">
            <TextInput
              name="organizationName"
              placeholder="Např. Advokátní kancelář Novák"
              autoComplete="organization"
              required
            />
          </Field>
          <Button type="submit" className="w-full">
            Založit kancelář
          </Button>
        </form>
      </section>

      <div className="my-6 flex items-center gap-3 text-xs text-[var(--iv-muted)]">
        <span className="h-px flex-1 bg-[var(--iv-line)]" />
        nebo
        <span className="h-px flex-1 bg-[var(--iv-line)]" />
      </div>

      <section aria-labelledby="join-organization-heading">
        <h2
          id="join-organization-heading"
          className="text-sm font-semibold text-[var(--iv-ink)]"
        >
          Připojit se ke stávající kanceláři
        </h2>
        <p className="mb-3 mt-1 text-sm text-[var(--iv-muted)]">
          Kód vám předá správce kanceláře. Není to přihlašovací údaj — pouze
          vás připojí ke kanceláři.
        </p>
        {joinError ? (
          <p
            role="alert"
            className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {joinError}
          </p>
        ) : null}
        <form action={joinOrganization} className="grid gap-4">
          <Field label="Registrační kód">
            <TextInput
              name="code"
              placeholder="ABCD-EFGH-JKLM"
              autoComplete="off"
              autoCapitalize="characters"
              required
            />
          </Field>
          <Button type="submit" variant="ghost" className="w-full">
            Připojit se ke kanceláři
          </Button>
        </form>
      </section>
    </>
  );
}
