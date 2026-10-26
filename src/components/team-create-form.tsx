"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { createLegalTeam, type TeamFormState } from "@/app/actions/legal-teams";
import { Field, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FormResult } from "@/components/form-result";

const initialState: TeamFormState = { ok: false, version: 0 };

// Založení týmu. Výsledek (i chyba duplicitního názvu) se ukáže hned pod
// formulářem. Pole je kontrolované: React 19 by jinak po odeslání formulář
// vyprázdnil i při chybě a uživatel by přišel o zadaný název.
export function TeamCreateForm() {
  const [name, setName] = useState("");
  const [state, formAction] = useActionState(
    async (previous: TeamFormState, formData: FormData) => {
      const next = await createLegalTeam(previous, formData);
      if (next.ok) {
        setName("");
      }
      return next;
    },
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Název týmu" className="min-w-[14rem] flex-1">
          <TextInput
            name="name"
            placeholder="Např. Sporná agenda"
            maxLength={120}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Button type="submit" pendingLabel="Vytvářím…">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Vytvořit tým
        </Button>
      </div>
      <FormResult state={state} />
    </form>
  );
}
