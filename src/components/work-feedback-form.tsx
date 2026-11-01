"use client";

import { useActionState, useState } from "react";

import { addWorkFeedback } from "@/app/actions/work-feedback";
import { Field, SelectInput } from "@/components/form-field";
import { FormResult } from "@/components/form-result";
import { submitWithoutReset } from "@/components/rich-entry-forms";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import {
  initialRichEntryFormState,
  type RichEntryFormState,
} from "@/lib/rich-entry-form";
import {
  splitOptionsForRecipient,
  type FeedbackPickOption,
} from "@/lib/work-feedback";

function PickOptions({
  options,
  recipientId,
  recipientGroupLabel,
  otherGroupLabel,
}: {
  options: FeedbackPickOption[];
  recipientId: string;
  recipientGroupLabel: string;
  otherGroupLabel: string;
}) {
  const { recipient, other } = splitOptionsForRecipient(options, recipientId);
  const render = (option: FeedbackPickOption) => (
    <option key={option.id} value={option.id}>
      {option.label}
    </option>
  );
  if (recipient.length === 0) {
    return <>{other.map(render)}</>;
  }
  return (
    <>
      <optgroup label={recipientGroupLabel}>{recipient.map(render)}</optgroup>
      {other.length > 0 ? (
        <optgroup label={otherGroupLabel}>{other.map(render)}</optgroup>
      ) : null}
    </>
  );
}

// Nová zpětná vazba: komu, volitelně odkaz na úkol / výkaz práce a formátovaný
// text. Nabídka úkolů a výkazů obsahuje jen záznamy, které autor vidí (server
// to při uložení ověří znovu); záznamy vybraného příjemce jsou nahoře.
export function WorkFeedbackForm({
  recipients,
  tasks,
  workLogs,
}: {
  recipients: Array<{ id: string; name: string }>;
  tasks: FeedbackPickOption[];
  workLogs: FeedbackPickOption[];
}) {
  const [recipientId, setRecipientId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [workLogId, setWorkLogId] = useState("");
  // Roste jen po úspěchu: chyba editor nepřemountuje (text zůstane).
  const [resetKey, setResetKey] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (previous: RichEntryFormState, formData: FormData) => {
      const next = await addWorkFeedback(previous, formData);
      if (next.ok) {
        setRecipientId("");
        setTaskId("");
        setWorkLogId("");
        setResetKey((key) => key + 1);
      }
      return next;
    },
    initialRichEntryFormState,
  );

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="grid gap-3">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Komu">
          <SelectInput
            name="recipientId"
            required
            value={recipientId}
            onChange={(event) => setRecipientId(event.target.value)}
          >
            <option value="">Vyberte kolegu</option>
            {recipients.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Odkaz na úkol (nepovinné)">
          <SelectInput
            name="taskId"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
          >
            <option value="">Bez odkazu</option>
            <PickOptions
              options={tasks}
              recipientId={recipientId}
              recipientGroupLabel="Úkoly příjemce"
              otherGroupLabel="Ostatní úkoly"
            />
          </SelectInput>
        </Field>
        <Field label="Odkaz na výkaz práce (nepovinné)">
          <SelectInput
            name="workLogId"
            value={workLogId}
            onChange={(event) => setWorkLogId(event.target.value)}
          >
            <option value="">Bez odkazu</option>
            <PickOptions
              options={workLogs}
              recipientId={recipientId}
              recipientGroupLabel="Výkazy příjemce"
              otherGroupLabel="Ostatní výkazy"
            />
          </SelectInput>
        </Field>
      </div>
      <RichTextEditor
        key={resetKey}
        name="body"
        label="Zpětná vazba"
        placeholder="Co se povedlo, co příště jinak… Důležité **zvýrazněte**."
        required
      />
      {state.version > 0 ? <FormResult state={state} /> : null}
      <div>
        <Button type="submit" pending={isPending} pendingLabel="Ukládám…">
          Uložit zpětnou vazbu
        </Button>
      </div>
    </form>
  );
}
