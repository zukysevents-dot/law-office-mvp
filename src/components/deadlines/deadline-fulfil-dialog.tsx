"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  fulfillDeadline,
  type DeadlineActionState,
} from "@/app/actions/deadlines";
import { Field, TextArea, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { pragueTodayIso } from "@/lib/deadlines";

export type FulfilDialogDeadline = {
  id: string;
  title: string;
  caseName?: string;
  dueDateLabel: string;
  overdue: boolean;
};

const initialState: DeadlineActionState = { ok: false };

// One of the two submit buttons; only the clicked one shows its spinner
// (same pattern as DecisionButton in the billing approval queue).
function ModeButton({
  value,
  pendingLabel,
  variant,
  children,
}: {
  value: "fulfil" | "fulfil-archive";
  pendingLabel: string;
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const isMine = pending && data?.get("mode") === value;
  return (
    <Button
      type="submit"
      name="mode"
      value={value}
      variant={variant}
      pending={pending}
      showPendingIndicator={isMine}
      pendingLabel={isMine ? pendingLabel : undefined}
    >
      {children}
    </Button>
  );
}

function FulfilForm({
  deadline,
  onDone,
  onCancel,
}: {
  deadline: FulfilDialogDeadline;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(fulfillDeadline, initialState);
  const [today] = useState(() => pragueTodayIso());
  const handled = useRef<number | undefined>(undefined);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // Close once the action succeeded (the page has already re-rendered with
  // the deadline moved to its new tab).
  useEffect(() => {
    if (state.ok && state.submittedAt && handled.current !== state.submittedAt) {
      handled.current = state.submittedAt;
      onDoneRef.current();
    }
  }, [state]);

  return (
    // noValidate: a future date is reported by the server in Czech (the
    // native max= bubble would be in the browser's language); `max` still
    // limits the date picker.
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
          <dt className="text-[#566673]">Termín:</dt>
          <dd className={deadline.overdue ? "font-semibold text-red-700" : ""}>
            {deadline.dueDateLabel}
            {deadline.overdue ? " (po termínu)" : ""}
          </dd>
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
      <Field label="Datum splnění">
        <TextInput
          name="fulfilledOn"
          type="date"
          required
          defaultValue={today}
          max={today}
        />
      </Field>
      <Field label="Poznámka ke splnění (volitelné)">
        <TextArea
          name="completionNote"
          maxLength={2000}
          placeholder="Např. podáno datovou schránkou, ID zprávy…"
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Zrušit
        </Button>
        {/* DOM order: the first submit button is the implicit default (Enter). */}
        <ModeButton value="fulfil" pendingLabel="Ukládám…">
          Označit jako splněnou
        </ModeButton>
        <ModeButton value="fulfil-archive" variant="secondary" pendingLabel="Archivuji…">
          Splnit a archivovat
        </ModeButton>
      </div>
    </form>
  );
}

/**
 * „Splněno…" — opens a dialog that marks the obligation tied to a deadline as
 * fulfilled (date, optional note), optionally archiving it in the same step.
 */
export function DeadlineFulfilDialog({
  deadline,
}: {
  deadline: FulfilDialogDeadline;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-9 px-3"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Splněno…
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Označit lhůtu jako splněnou"
        size="md"
      >
        <FulfilForm
          deadline={deadline}
          onDone={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
