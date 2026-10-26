"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";

import { renameLegalTeam, type TeamFormState } from "@/app/actions/legal-teams";
import { Field, TextInput } from "@/components/form-field";
import { FormResult } from "@/components/form-result";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const initialState: TeamFormState = { ok: false, version: 0 };

// Přejmenování týmu v dialogu (× / Esc / klik mimo zavřou bez uložení). Po
// úspěšném uložení se dialog zavře a stránka se hned překreslí.
export function TeamRenameDialog({
  legalTeamId,
  currentName,
}: {
  legalTeamId: string;
  currentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  // Chyba se ukazuje jen pro pokus z aktuálně otevřeného dialogu.
  const [openedAt, setOpenedAt] = useState(0);
  const [state, formAction] = useActionState(
    async (previous: TeamFormState, formData: FormData) => {
      const next = await renameLegalTeam(previous, formData);
      if (next.ok) {
        setOpen(false);
      }
      return next;
    },
    initialState,
  );

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-8 px-3"
        aria-haspopup="dialog"
        onClick={() => {
          setName(currentName);
          setOpenedAt(Date.now());
          setOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Přejmenovat
        <span className="sr-only"> tým {currentName}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Přejmenovat tým" size="sm">
        <form action={formAction} className="grid gap-4 px-4 py-4 sm:px-5">
          <input type="hidden" name="legalTeamId" value={legalTeamId} />
          <Field label="Název týmu">
            <TextInput
              name="name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </Field>
          {state.error && state.version >= openedAt ? (
            <FormResult state={state} />
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit" pendingLabel="Ukládám…">
              Uložit
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
