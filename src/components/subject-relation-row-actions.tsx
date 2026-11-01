"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import {
  removeSubjectRelation,
  updateSubjectRelation,
  type RelationFormState,
} from "@/app/actions/subject-relations";
import { Field, SelectInput, TextArea } from "@/components/form-field";
import { FormResult } from "@/components/form-result";
import { Button } from "@/components/ui/button";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import type { SubjectRole } from "@/generated/prisma/enums";
import { options, subjectRoleLabels } from "@/lib/labels";
import { RELATION_NOTE_MAX } from "@/lib/subject-relations";

const initialState: RelationFormState = { ok: false, version: 0 };

// Úprava role / poznámky vazby subjektu v dialogu a její odebrání s potvrzením.
// Vazba na hlavního klienta projektu (`locked`) má zamčenou roli a nejde
// odebrat — klienta mění úprava projektu; server to hlídá stejně.
export function SubjectRelationRowActions({
  relationId,
  subjectName,
  role,
  note,
  locked,
}: {
  relationId: string;
  subjectName: string;
  role: SubjectRole;
  note: string | null;
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Verze stavu v okamžiku otevření dialogu: chyba z dřívějšího pokusu se po
  // novém otevření neukáže. (Porovnává se verze, ne čas klienta proti času
  // serveru — rozjeté hodiny by jinak novou chybu skryly.)
  const [versionAtOpen, setVersionAtOpen] = useState(initialState.version);
  const [state, formAction] = useActionState(
    async (previous: RelationFormState, formData: FormData) => {
      const next = await updateSubjectRelation(previous, formData);
      if (next.ok) {
        setOpen(false);
      }
      return next;
    },
    initialState,
  );

  return (
    <div className="flex flex-nowrap items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        className="h-8 px-3"
        aria-haspopup="dialog"
        onClick={() => {
          setVersionAtOpen(state.version);
          setOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Upravit
        <span className="sr-only"> vazbu {subjectName}</span>
      </Button>
      {locked ? null : (
        <form action={removeSubjectRelation} className="inline-flex">
          <input type="hidden" name="relationId" value={relationId} />
          <ConfirmDialogButton
            label={
              <>
                Odebrat
                <span className="sr-only"> vazbu {subjectName}</span>
              </>
            }
            confirmLabel="Odebrat vazbu"
            title="Odebrat vazbu subjektu"
            message={`Opravdu odebrat vazbu subjektu „${subjectName}“ (${subjectRoleLabels[role]})? Subjekt samotný zůstane v evidenci.`}
            pendingLabel="Odebírám…"
            variant="ghost"
            className="h-8 px-3 text-red-700 hover:text-red-800"
          />
        </form>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Upravit vazbu subjektu"
        description={subjectName}
        size="sm"
      >
        <form action={formAction} className="grid gap-4 px-4 py-4 sm:px-5">
          <input type="hidden" name="relationId" value={relationId} />
          <Field label="Role subjektu">
            <SelectInput name="role" defaultValue={role} disabled={locked}>
              {options.subjectRoles.map((option) => (
                <option key={option} value={option}>
                  {subjectRoleLabels[option]}
                </option>
              ))}
            </SelectInput>
          </Field>
          {locked ? (
            <>
              {/* disabled select se neodesílá — role zůstává stejná */}
              <input type="hidden" name="role" value={role} />
              <p className="text-xs text-[#566673]">
                Hlavní klient projektu má roli pevně danou. Klienta změníte v
                úpravě projektu.
              </p>
            </>
          ) : null}
          <Field label="Poznámka">
            <TextArea name="note" defaultValue={note ?? ""} maxLength={RELATION_NOTE_MAX} />
          </Field>
          {state.error && state.version !== versionAtOpen ? (
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
    </div>
  );
}
