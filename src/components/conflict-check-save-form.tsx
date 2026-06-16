"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";

import {
  saveConflictCheck,
  type ConflictCheckSaveState,
} from "@/app/actions/conflict-checks";
import { Field, TextArea, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";

const initialState: ConflictCheckSaveState = {
  saved: false,
};

function SubmitButton({
  label,
  saved,
  className,
}: {
  label: string;
  saved: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className={className} disabled={pending || saved}>
      <Save className="h-4 w-4" aria-hidden="true" />
      {saved ? "Uloženo" : pending ? "Ukládám..." : label}
    </Button>
  );
}

export function ConflictCheckSaveForm({
  searchedQuery,
  subjectId,
  noteControl = "textarea",
  buttonLabel,
  className,
  buttonClassName,
}: {
  searchedQuery: string;
  subjectId?: string;
  noteControl?: "input" | "textarea";
  buttonLabel: string;
  className: string;
  buttonClassName?: string;
}) {
  const [state, formAction] = useActionState(saveConflictCheck, initialState);
  const saved = state.saved;

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="searchedQuery" value={searchedQuery} />
      {subjectId ? <input type="hidden" name="subjectId" value={subjectId} /> : null}
      <Field label="Poznámka">
        {noteControl === "textarea" ? (
          <TextArea name="note" className="min-h-16" disabled={saved} />
        ) : (
          <TextInput name="note" disabled={saved} />
        )}
      </Field>
      <SubmitButton label={buttonLabel} saved={saved} className={buttonClassName} />
      {saved ? (
        <p className="text-sm font-medium text-[#072924]">
          {state.message ?? "Conflict check uložen"}
        </p>
      ) : null}
    </form>
  );
}
