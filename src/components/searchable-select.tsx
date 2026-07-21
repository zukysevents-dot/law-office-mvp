"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type SearchableOption = { id: string; label: string };

type Props = {
  // Name of the hidden field that carries the selected option's id on submit.
  name: string;
  options: SearchableOption[];
  defaultValue?: string; // selected option id
  placeholder?: string;
  required?: boolean;
  emptyLabel?: string; // shown as a hint; selecting nothing submits ""
  // Fired only on user-driven selection changes (not on initial mount), so a
  // parent can cascade dependent selects without clobbering provided defaults.
  onSelect?: (id: string) => void;
};

const controlClass =
  "h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600";

// A type-to-search picker backed by a native <datalist>. The user types/sees a
// label, but the form submits the option's id via a hidden field — so it drops
// into existing FormData-based server actions unchanged. Firms have 200+
// clients, so plain <select> dropdowns are unusable; this lets you just type.
export function SearchableSelect({
  name,
  options,
  defaultValue,
  placeholder,
  required,
  emptyLabel,
  onSelect,
}: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Ensure every displayed label is unique so it maps back to exactly one id —
  // e.g. two subjects named "Jan Novák" with no IČO become "Jan Novák" and
  // "Jan Novák (2)". Otherwise the label→id lookup would silently pick one.
  const display = useMemo(() => {
    const seen = new Map<string, number>();
    return options.map((o) => {
      const n = (seen.get(o.label) ?? 0) + 1;
      seen.set(o.label, n);
      return { id: o.id, label: n > 1 ? `${o.label} (${n})` : o.label };
    });
  }, [options]);

  const byLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of display) map.set(o.label.trim().toLowerCase(), o.id);
    return map;
  }, [display]);

  const initialLabel = display.find((o) => o.id === defaultValue)?.label ?? "";
  const [text, setText] = useState(initialLabel);
  const selectedId = byLabel.get(text.trim().toLowerCase()) ?? "";

  // Constraint Validation: when required and no option is resolved (empty OR
  // free text that doesn't match any option), mark the field invalid so the
  // form can't submit an empty id (which would 500 the server action).
  useEffect(() => {
    inputRef.current?.setCustomValidity(
      required && !selectedId ? "Vyberte položku ze seznamu." : "",
    );
  }, [required, selectedId]);

  // Notify parent of user-driven changes only. Skip the first run so provided
  // defaults aren't treated as a change (which would reset cascaded children).
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onSelectRef.current?.(selectedId);
  }, [selectedId]);

  return (
    <>
      <input type="hidden" name={name} value={selectedId} />
      <input
        ref={inputRef}
        className={cn(controlClass)}
        list={listId}
        value={text}
        placeholder={placeholder ?? emptyLabel}
        onChange={(event) => setText(event.target.value)}
      />
      <datalist id={listId}>
        {display.map((o) => (
          <option key={o.id} value={o.label} />
        ))}
      </datalist>
    </>
  );
}
