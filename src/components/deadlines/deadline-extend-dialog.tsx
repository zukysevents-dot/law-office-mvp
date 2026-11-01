"use client";

import { CalendarPlus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import {
  extendDeadline,
  type DeadlineActionState,
} from "@/app/actions/deadlines";
import { Field, TextArea, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EXTENSION_REASON_MAX } from "@/lib/deadline-extension";

export type ExtendDialogDeadline = {
  id: string;
  title: string;
  caseName?: string;
  dueDateLabel: string;
  /** Current due date as `YYYY-MM-DD` (UTC day of the stored value). */
  dueDateIso: string;
};

const initialState: DeadlineActionState = { ok: false };

function nextDayIso(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function ExtendForm({
  deadline,
  onDone,
  onCancel,
}: {
  deadline: ExtendDialogDeadline;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(extendDeadline, initialState);
  const handled = useRef<number | undefined>(undefined);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (state.ok && state.submittedAt && handled.current !== state.submittedAt) {
      handled.current = state.submittedAt;
      onDoneRef.current();
    }
  }, [state]);

  const minDate = nextDayIso(deadline.dueDateIso);

  return (
    // noValidate: validation messages come from the server in Czech; `min`
    // still limits the date picker.
    <form action={formAction} noValidate className="grid gap-4 px-4 py-4 sm:px-5">
      <input type="hidden" name="deadlineId" value={deadline.id} />
      <dl className="grid gap-1 rounded-md border border-[#dce4e8] bg-[#f4f7f8] px-3 py-2 text-sm text-[#2c3a45]">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-[#566673]">Lhůta:</dt>
          <dd className="font-medium text-[#0e1822]">{deadline.title}</dd>
        </div>
        {deadline.caseName ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-[#566673]">Spis:</dt>
            <dd>{deadline.caseName}</dd>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-[#566673]">Současný termín:</dt>
          <dd className="font-medium">{deadline.dueDateLabel}</dd>
        </div>
      </dl>
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      <Field label="Nový termín">
        <TextInput name="newDueDate" type="date" required min={minDate} defaultValue={minDate} />
      </Field>
      <Field label="Důvod prodloužení">
        <TextArea
          name="reason"
          required
          maxLength={EXTENSION_REASON_MAX}
          placeholder="Např. soud vyhověl žádosti o prodloužení lhůty (usnesení č. j. …)"
        />
      </Field>
      <p className="text-xs text-[#566673]">
        Prodloužení se uloží do historie lhůty i do auditní stopy (kdo, kdy,
        původní a nový termín, důvod).
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Zrušit
        </Button>
        <Button type="submit" pendingLabel="Prodlužuji…">
          Prodloužit lhůtu
        </Button>
      </div>
    </form>
  );
}

/** „Prodloužit…" — nový termín lhůty s důvodem a auditní stopou. */
export function DeadlineExtendDialog({
  deadline,
}: {
  deadline: ExtendDialogDeadline;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-9 whitespace-nowrap px-3"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        Prodloužit…
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Prodloužit lhůtu"
        size="md"
      >
        <ExtendForm
          deadline={deadline}
          onDone={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
