"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Field, SelectInput, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { SubjectContactType } from "@/generated/prisma/enums";
import {
  options,
  subjectContactLabelSuggestions,
  subjectContactTypeLabels,
  subjectContactValueLabels,
} from "@/lib/labels";

export type ContactDefault = {
  id: string | null;
  type: SubjectContactType;
  value: string;
  label: string | null;
  isPrimary: boolean;
};

type ContactState = ContactDefault & { key: string };

const valueInputProps: Record<
  SubjectContactType,
  { type: string; inputMode?: "email" | "tel" | "url" | "text"; placeholder: string }
> = {
  EMAIL: { type: "email", inputMode: "email", placeholder: "např. info@firma.cz" },
  PHONE: { type: "tel", inputMode: "tel", placeholder: "např. +420 777 123 456" },
  DATA_BOX: { type: "text", placeholder: "např. abc1234" },
  WEB: { type: "text", inputMode: "url", placeholder: "např. www.firma.cz" },
  OTHER: { type: "text", placeholder: "např. Skype, Signal…" },
};

const LABEL_LIST_ID = "subject-contact-label-suggestions";

/**
 * Repeated contact rows of the subject form (`contact.<key>.<field>`). Lives
 * inside the parent server-action `<form>`; every button is `type="button"`
 * so adding/removing never submits. Empty rows are ignored by the server.
 */
export function SubjectContactsEditor({
  defaults,
}: {
  defaults: ContactDefault[];
}) {
  const counter = useRef(0);
  const [rows, setRows] = useState<ContactState[]>(() =>
    defaults.map((row, index) => ({ ...row, key: row.id ?? `n${index}` })),
  );

  // Keyboard users keep their place: a new row gets focus, removing a row
  // moves focus to the next row (or the "Přidat" buttons).
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const focusSelector = useRef<string | null>(null);
  useEffect(() => {
    const selector = focusSelector.current;
    if (!selector) return;
    focusSelector.current = null;
    fieldsetRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [rows]);

  function nextKey() {
    counter.current += 1;
    return `new${counter.current}`;
  }

  function addRow(type: SubjectContactType) {
    const key = nextKey();
    focusSelector.current = `[name="contact.${key}.value"]`;
    setRows((current) => [
      ...current,
      {
        key,
        id: null,
        type,
        value: "",
        label: null,
        // The first contact of its type becomes the primary one.
        isPrimary: !current.some((row) => row.type === type),
      },
    ]);
  }

  function update(key: string, patch: Partial<ContactState>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function setPrimary(key: string, checked: boolean) {
    setRows((current) => {
      const target = current.find((row) => row.key === key);
      if (!target) return current;
      return current.map((row) => {
        if (row.key === key) return { ...row, isPrimary: checked };
        // Only one primary per contact type.
        return checked && row.type === target.type ? { ...row, isPrimary: false } : row;
      });
    });
  }

  function remove(key: string) {
    const index = rows.findIndex((row) => row.key === key);
    const remaining = rows.filter((row) => row.key !== key);
    const next = remaining[index] ?? remaining[index - 1];
    focusSelector.current = next
      ? `[data-remove-contact="${next.key}"]`
      : "[data-add-contact]";
    setRows(remaining);
  }

  return (
    <fieldset ref={fieldsetRef} id="kontakty" className="grid scroll-mt-6 gap-3">
      <legend className="mb-1 text-sm font-semibold text-[#0e1822]">
        Kontaktní údaje
      </legend>
      <p className="text-sm text-[#566673]">
        E-maily, telefony, datové schránky a další kontakty subjektu. Hlavní
        e-mail se použije pro faktury a klientský portál, e-mail označený
        „fakturace“ má u faktur přednost.
      </p>
      <datalist id={LABEL_LIST_ID}>
        {subjectContactLabelSuggestions.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      {rows.length === 0 ? (
        <p className="text-sm text-[#566673]">Zatím žádné kontaktní údaje.</p>
      ) : null}
      <ul className="grid gap-3">
        {rows.map((row, index) => {
          const input = valueInputProps[row.type];
          return (
            <li
              key={row.key}
              className="grid min-w-0 gap-3 rounded-md border border-[#dce4e8] bg-[#F4F7F8] p-3 md:grid-cols-[10rem_minmax(0,1fr)_10rem_auto_auto] md:items-end"
            >
              <input type="hidden" name={`contact.${row.key}.id`} value={row.id ?? ""} />
              <Field label="Typ kontaktu" className="min-w-0">
                <SelectInput
                  name={`contact.${row.key}.type`}
                  value={row.type}
                  onChange={(event) =>
                    update(row.key, { type: event.target.value as SubjectContactType })
                  }
                >
                  {options.subjectContactTypes.map((type) => (
                    <option key={type} value={type}>
                      {subjectContactTypeLabels[type]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label={subjectContactValueLabels[row.type]} className="min-w-0">
                <TextInput
                  name={`contact.${row.key}.value`}
                  type={input.type}
                  inputMode={input.inputMode}
                  placeholder={input.placeholder}
                  value={row.value}
                  maxLength={320}
                  onChange={(event) => update(row.key, { value: event.target.value })}
                />
              </Field>
              <Field label="Označení" className="min-w-0">
                <TextInput
                  name={`contact.${row.key}.label`}
                  list={LABEL_LIST_ID}
                  placeholder="např. fakturace"
                  value={row.label ?? ""}
                  maxLength={100}
                  onChange={(event) => update(row.key, { label: event.target.value })}
                />
              </Field>
              <label className="flex h-10 items-center gap-2 text-sm font-medium text-[#0e1822]">
                <input
                  type="checkbox"
                  name={`contact.${row.key}.primary`}
                  checked={row.isPrimary}
                  onChange={(event) => setPrimary(row.key, event.target.checked)}
                  className="h-4 w-4 rounded border-stone-300"
                />
                Hlavní
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => remove(row.key)}
                data-remove-contact={row.key}
                aria-label={`Odebrat kontakt ${index + 1}`}
                title="Odebrat kontakt"
                className="w-full md:w-10 md:px-0"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="md:sr-only">Odebrat</span>
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => addRow(SubjectContactType.EMAIL)}
          data-add-contact
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Přidat e-mail
        </Button>
        <Button type="button" variant="ghost" onClick={() => addRow(SubjectContactType.PHONE)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Přidat telefon
        </Button>
        <Button type="button" variant="ghost" onClick={() => addRow(SubjectContactType.OTHER)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Přidat jiný kontakt
        </Button>
      </div>
    </fieldset>
  );
}
