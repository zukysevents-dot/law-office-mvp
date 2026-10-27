"use client";

import { CalendarClock } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { postponeTask, type TaskActionState } from "@/app/actions/tasks";
import { Field, TextArea, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { pragueTodayIso } from "@/lib/deadlines";
import {
  POSTPONE_REASON_MAX_LENGTH,
  addToIsoDate,
  minimumPostponeIso,
} from "@/lib/tasks/deadline-history";

const initialState: TaskActionState = { ok: false };

const QUICK_OPTIONS = [
  { label: "+1 týden", shift: { days: 7 } },
  { label: "+2 týdny", shift: { days: 14 } },
  { label: "+1 měsíc", shift: { months: 1 } },
] as const;

export type PostponeDialogTask = {
  id: string;
  title: string;
  /** Současný termín `YYYY-MM-DD`. */
  deadlineIso: string;
  /** Současný termín pro zobrazení („12. 10. 2026“). */
  deadlineLabel: string;
  overdue: boolean;
};

function PostponeForm({
  task,
  onDone,
  onCancel,
}: {
  task: PostponeDialogTask;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(postponeTask, initialState);
  const [today] = useState(() => pragueTodayIso());
  const [newDeadline, setNewDeadline] = useState("");
  const handled = useRef<number | undefined>(undefined);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // Zavřít po úspěchu (stránka už je překreslená s novým termínem).
  useEffect(() => {
    if (state.ok && state.submittedAt && handled.current !== state.submittedAt) {
      handled.current = state.submittedAt;
      onDoneRef.current();
    }
  }, [state]);

  const minimum = minimumPostponeIso(task.deadlineIso, today);

  return (
    // noValidate: chyby hlásí server česky (nativní bublina `min` by byla
    // v jazyce prohlížeče); `min` dál omezuje výběr v kalendáři.
    <form action={formAction} noValidate className="grid gap-4 px-4 py-4 sm:px-5">
      <input type="hidden" name="taskId" value={task.id} />
      <dl className="grid gap-1 rounded-md border border-[#dce4e8] bg-[#f4f7f8] px-3 py-2 text-sm text-[#2c3a45]">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-[#566673]">Úkol:</dt>
          <dd className="font-medium text-[#0e1822]">{task.title}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-[#566673]">Současný termín:</dt>
          <dd className={task.overdue ? "font-semibold text-red-700" : ""}>
            {task.deadlineLabel}
            {task.overdue ? " (po termínu)" : ""}
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
      <Field label="Nový termín">
        <TextInput
          name="newDeadline"
          type="date"
          required
          min={minimum}
          value={newDeadline}
          onChange={(event) => setNewDeadline(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Rychlá volba nového termínu">
        <span className="text-sm text-[#566673]">Od současného termínu:</span>
        {QUICK_OPTIONS.map((option) => (
          <Button
            key={option.label}
            type="button"
            variant="ghost"
            className="h-8 px-3"
            onClick={() => setNewDeadline(addToIsoDate(task.deadlineIso, option.shift))}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <Field label="Důvod odložení (volitelné)">
        <TextArea
          name="reason"
          maxLength={POSTPONE_REASON_MAX_LENGTH}
          placeholder="Např. čekáme na podklady od klienta"
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Zrušit
        </Button>
        <Button type="submit" pendingLabel="Ukládám…">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Odložit úkol
        </Button>
      </div>
    </form>
  );
}

/**
 * „Odložit“ — dialog pro posun termínu úkolu na pozdější datum s volitelným
 * důvodem. Odložení se zapíše do historie úkolu (časová osa vedle komentářů).
 */
export function TaskPostponeDialog({ task }: { task: PostponeDialogTask }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        Odložit
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Odložit úkol" size="md">
        <PostponeForm
          task={task}
          onDone={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </Dialog>
    </>
  );
}
