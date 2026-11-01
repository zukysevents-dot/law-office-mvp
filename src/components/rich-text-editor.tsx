"use client";

import { Bold, Italic, Underline } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { RichText } from "@/components/rich-text";
import {
  RICH_TEXT_MAX_LENGTH,
  toggleRichTextMark,
  type RichTextMark,
} from "@/lib/rich-text";
import { cn } from "@/lib/utils";

const TOOLBAR: Array<{
  mark: RichTextMark;
  label: string;
  shortcut: string;
  icon: typeof Bold;
}> = [
  { mark: "bold", label: "Tučně", shortcut: "B", icon: Bold },
  { mark: "underline", label: "Podtrženě", shortcut: "U", icon: Underline },
  { mark: "italic", label: "Kurzívou", shortcut: "I", icon: Italic },
];

const SHORTCUTS: Record<string, RichTextMark> = {
  b: "bold",
  u: "underline",
  i: "italic",
};

// Textové pole s tlačítky Tučně / Podtrženě / Kurzívou (i Ctrl/⌘+B/U/I).
// Ukládá omezený formát ze src/lib/rich-text.ts a pod polem ukazuje náhled.
// Hodnota je řízená stavem, takže se po neúspěšném odeslání neztratí; po
// úspěšném odeslání rodič komponentu přemountuje (změnou `key`).
export function RichTextEditor({
  name,
  label,
  defaultValue = "",
  required,
  maxLength = RICH_TEXT_MAX_LENGTH,
  placeholder,
  rows = 4,
  autoFocus,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);
  const pendingSelection = useRef<[number, number] | null>(null);

  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const textarea = textareaRef.current;
    if (selection && textarea) {
      pendingSelection.current = null;
      textarea.focus();
      textarea.setSelectionRange(selection[0], selection[1]);
    }
  }, [value]);

  function applyMark(mark: RichTextMark) {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const edit = toggleRichTextMark(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
      mark,
    );
    if (edit.value.length > maxLength) {
      return;
    }
    pendingSelection.current = [edit.selectionStart, edit.selectionEnd];
    setValue(edit.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
      return;
    }
    const mark = SHORTCUTS[event.key.toLowerCase()];
    if (mark) {
      event.preventDefault();
      applyMark(mark);
    }
  }

  const hasFormatting = /\*|__/.test(value);

  return (
    <div className="grid gap-1.5 text-sm">
      <label htmlFor={id} className="font-medium text-[#0e1822]">
        {label}
      </label>
      <div className="rounded-md border border-[#dce4e8] bg-white shadow-sm focus-within:border-[#0e1822] focus-within:ring-2 focus-within:ring-[#0e1822]/20">
        <div
          role="toolbar"
          aria-label="Formátování textu"
          aria-controls={id}
          className="flex items-center gap-1 border-b border-[#dce4e8] px-1.5 py-1"
        >
          {TOOLBAR.map(({ mark, label: markLabel, shortcut, icon: Icon }) => (
            <button
              key={mark}
              type="button"
              title={`${markLabel} (Ctrl+${shortcut})`}
              aria-label={markLabel}
              // Fokus i výběr zůstávají v textovém poli.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyMark(mark)}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[#2c3a45] transition hover:bg-[#17A2A2]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0e1822]"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          ))}
          <span className="ml-auto hidden pr-1 text-xs text-[#566673] sm:inline">
            **tučně** · __podtrženo__ · *kurzíva*
          </span>
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          required={required}
          maxLength={maxLength}
          placeholder={placeholder}
          rows={rows}
          autoFocus={autoFocus}
          className={cn(
            "block min-h-24 w-full resize-y rounded-b-md bg-white px-3 py-2 text-sm outline-none placeholder:text-[#566673]",
          )}
        />
      </div>
      {hasFormatting ? (
        <div className="rounded-md border border-dashed border-[#dce4e8] bg-[#F4F7F8]/65 px-3 py-2">
          <p className="mb-1 text-xs font-semibold uppercase text-[#566673]">
            Náhled
          </p>
          <RichText value={value} className="text-sm text-[#0e1822]" />
        </div>
      ) : null}
    </div>
  );
}
