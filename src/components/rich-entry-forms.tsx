"use client";

import { Pencil, Trash2 } from "lucide-react";
import {
  startTransition,
  useActionState,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { FormResult } from "@/components/form-result";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import {
  initialRichEntryFormState,
  type RichEntryFormState,
} from "@/lib/rich-entry-form";

type RichEntryAction = (
  previous: RichEntryFormState,
  formData: FormData,
) => Promise<RichEntryFormState>;

// Společné formuláře pro záznamy s formátovaným textem (komentáře u projektů
// a případů, zpětná vazba): přidání, úprava v dialogu a archivace („smazat“).

// Odeslání formuláře přes onSubmit místo `<form action>`: React by jinak po
// každé akci formulář vyresetoval a při chybě validace by se napsaný text
// ztratil. Pending stav tlačítek pak nese `isPending` z useActionState.
export function submitWithoutReset(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
}

// Formulář pro nový záznam. Po úspěchu se editor vyprázdní (nový `key`),
// po chybě text zůstane a chyba se ukáže nad tlačítkem.
export function RichEntryCreateForm({
  action,
  hiddenFields,
  label,
  placeholder,
  submitLabel,
  children,
}: {
  action: RichEntryAction;
  hiddenFields: Record<string, string>;
  label: string;
  placeholder?: string;
  submitLabel: string;
  /** Další pole formuláře nad textem (např. příjemce, odkazy). */
  children?: ReactNode;
}) {
  // Roste jen po úspěchu: chyba editor nepřemountuje (text zůstane).
  const [resetKey, setResetKey] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (previous: RichEntryFormState, formData: FormData) => {
      const next = await action(previous, formData);
      if (next.ok) {
        setResetKey((key) => key + 1);
      }
      return next;
    },
    initialRichEntryFormState,
  );

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="grid gap-3">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <RichTextEditor
        key={resetKey}
        name="body"
        label={label}
        placeholder={placeholder}
        required
      />
      {state.version > 0 ? <FormResult state={state} /> : null}
      <div>
        <Button type="submit" pending={isPending} pendingLabel="Ukládám…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// Tlačítka „Upravit“ a „Smazat“ u záznamu (jen pro autora — rozhoduje server).
export function RichEntryRowActions({
  id,
  body,
  updateAction,
  archiveAction,
  editTitle,
  archiveMessage,
}: {
  id: string;
  body: string;
  updateAction: RichEntryAction;
  archiveAction: (formData: FormData) => Promise<void>;
  editTitle: string;
  archiveMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (previous: RichEntryFormState, formData: FormData) => {
      const next = await updateAction(previous, formData);
      if (next.ok) {
        setOpen(false);
      }
      return next;
    },
    initialRichEntryFormState,
  );

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="ghost"
        className="h-8 px-3"
        aria-haspopup="dialog"
        onClick={() => {
          setOpenedAt(Date.now());
          setOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Upravit
      </Button>
      <form action={archiveAction} className="inline-flex">
        <input type="hidden" name="id" value={id} />
        <ConfirmDialogButton
          label={
            <>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Smazat
            </>
          }
          confirmLabel="Smazat"
          message={archiveMessage}
          className="h-8 px-3"
          pendingLabel="Mažu…"
        />
      </form>
      <Dialog open={open} onOpenChange={setOpen} title={editTitle} size="lg">
        <form
          onSubmit={submitWithoutReset(formAction)}
          className="grid gap-4 px-4 py-4 sm:px-5"
        >
          <input type="hidden" name="id" value={id} />
          <RichTextEditor
            name="body"
            label="Text"
            defaultValue={body}
            required
            rows={6}
            autoFocus
          />
          {state.error && state.version >= openedAt ? (
            <FormResult state={state} />
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit" pending={isPending} pendingLabel="Ukládám…">
              Uložit
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
