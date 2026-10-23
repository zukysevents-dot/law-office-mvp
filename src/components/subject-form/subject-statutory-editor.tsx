"use client";

import { useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Field, SelectInput, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { statutoryFunctionSuggestions } from "@/lib/labels";

export type StatutoryRowState = {
  key: string;
  id: string | null;
  name: string;
  function: string;
  actingMethod: string;
  /** "YYYY-MM-DD" or "". */
  validFrom: string;
  validTo: string;
  linkedSubjectId: string;
};

export type SubjectLinkOption = { id: string; name: string; ico: string | null };

const FUNCTION_LIST_ID = "subject-statutory-function-suggestions";

/**
 * Controlled rows of statutory bodies (`statutory.<key>.<field>`). State lives
 * in the parent so the ARES pre-fill can append rows.
 */
export function SubjectStatutoryEditor({
  rows,
  onChange,
  onAdd,
  linkOptions,
  aresSlot,
}: {
  rows: StatutoryRowState[];
  onChange: (rows: StatutoryRowState[]) => void;
  onAdd: () => void;
  linkOptions: SubjectLinkOption[];
  aresSlot?: React.ReactNode;
}) {
  // Keyboard users keep their place: a new row gets focus, removing a row
  // moves focus to the next row (or the "Přidat" button).
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const focusSelector = useRef<string | null>(null);
  const focusNewRow = useRef(false);
  const lastKey = rows.at(-1)?.key;
  useEffect(() => {
    if (focusNewRow.current && lastKey) {
      focusNewRow.current = false;
      focusSelector.current = `[name="statutory.${lastKey}.name"]`;
    }
    const selector = focusSelector.current;
    if (!selector) return;
    focusSelector.current = null;
    fieldsetRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [rows, lastKey]);

  function add() {
    focusNewRow.current = true;
    onAdd();
  }

  function remove(key: string) {
    const index = rows.findIndex((row) => row.key === key);
    const remaining = rows.filter((row) => row.key !== key);
    const next = remaining[index] ?? remaining[index - 1];
    focusSelector.current = next
      ? `[data-remove-statutory="${next.key}"]`
      : "[data-add-statutory]";
    onChange(remaining);
  }

  function update(key: string, patch: Partial<StatutoryRowState>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <fieldset ref={fieldsetRef} id="statutarni-organy" className="grid scroll-mt-6 gap-3">
      <legend className="mb-1 text-sm font-semibold text-[#0e1822]">
        Statutární orgány
      </legend>
      <p className="text-sm text-[#566673]">
        Statutární orgán jedná za subjekt (např. jednatel). Lidi, se kterými jen
        komunikujete, evidujte v sekci Kontaktní osoby na detailu.
      </p>
      <datalist id={FUNCTION_LIST_ID}>
        {statutoryFunctionSuggestions.map((fn) => (
          <option key={fn} value={fn} />
        ))}
      </datalist>
      {aresSlot}
      {rows.length === 0 ? (
        <p className="text-sm text-[#566673]">Zatím žádné statutární orgány.</p>
      ) : null}
      <ul className="grid gap-3">
        {rows.map((row, index) => {
          const filled = Boolean(
            row.function ||
              row.actingMethod ||
              row.validFrom ||
              row.validTo ||
              row.linkedSubjectId,
          );
          const linkMissing =
            row.linkedSubjectId &&
            !linkOptions.some((option) => option.id === row.linkedSubjectId);
          return (
            <li
              key={row.key}
              className="grid min-w-0 gap-3 rounded-md border border-[#dce4e8] bg-[#F4F7F8] p-3 md:grid-cols-3"
            >
              <input type="hidden" name={`statutory.${row.key}.id`} value={row.id ?? ""} />
              <Field label="Jméno / název" className="min-w-0">
                <TextInput
                  name={`statutory.${row.key}.name`}
                  value={row.name}
                  required={filled}
                  maxLength={500}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                />
              </Field>
              <Field label="Funkce" className="min-w-0">
                <TextInput
                  name={`statutory.${row.key}.function`}
                  list={FUNCTION_LIST_ID}
                  placeholder="např. jednatel"
                  value={row.function}
                  maxLength={500}
                  onChange={(event) => update(row.key, { function: event.target.value })}
                />
              </Field>
              <Field label="Propojený subjekt" className="min-w-0">
                <SelectInput
                  name={`statutory.${row.key}.linkedSubjectId`}
                  value={row.linkedSubjectId}
                  onChange={(event) =>
                    update(row.key, { linkedSubjectId: event.target.value })
                  }
                >
                  <option value="">Bez vazby</option>
                  {linkMissing ? (
                    <option value={row.linkedSubjectId}>(propojený subjekt)</option>
                  ) : null}
                  {linkOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.ico ? `${option.name} (IČO ${option.ico})` : option.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Způsob jednání" className="min-w-0 md:col-span-3">
                <TextInput
                  name={`statutory.${row.key}.actingMethod`}
                  placeholder="např. jedná samostatně"
                  value={row.actingMethod}
                  maxLength={4000}
                  onChange={(event) => update(row.key, { actingMethod: event.target.value })}
                />
              </Field>
              <Field label="Od" className="min-w-0">
                <TextInput
                  type="date"
                  name={`statutory.${row.key}.validFrom`}
                  value={row.validFrom}
                  onChange={(event) => update(row.key, { validFrom: event.target.value })}
                />
              </Field>
              <Field label="Do" className="min-w-0">
                <TextInput
                  type="date"
                  name={`statutory.${row.key}.validTo`}
                  value={row.validTo}
                  min={row.validFrom || undefined}
                  onChange={(event) => update(row.key, { validTo: event.target.value })}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => remove(row.key)}
                  data-remove-statutory={row.key}
                  aria-label={`Odebrat statutární orgán ${index + 1}`}
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Odebrat
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div>
        <Button type="button" variant="ghost" onClick={add} data-add-statutory>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Přidat statutární orgán
        </Button>
      </div>
    </fieldset>
  );
}
