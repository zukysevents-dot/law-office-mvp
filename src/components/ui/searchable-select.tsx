"use client";

import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  initialActiveIndex,
  itemValue,
  searchableSelectItems,
  type SearchableSelectItem,
  type SearchableSelectOption,
} from "@/lib/searchable-select";
import { cn } from "@/lib/utils";

export type { SearchableSelectOption } from "@/lib/searchable-select";

// Same look as SelectInput / TextInput (form-field.tsx).
const controlClass =
  "h-10 w-full rounded-md border border-[#dce4e8] bg-white pl-3 pr-9 text-sm text-[#1e2a35] shadow-sm outline-none transition placeholder:text-[#566673] focus:border-[#0e1822] focus:ring-2 focus:ring-[#0e1822]/20 disabled:cursor-not-allowed disabled:bg-[#f4f7f8] disabled:text-[#566673]";

const LIST_MAX_HEIGHT = 288; // px, ~ 8 řádků
const LIST_MIN_WIDTH = 240;

type ListPosition = { left: number; width: number; top?: number; bottom?: number };

/**
 * Výběr ze seznamu s fulltextovým hledáním — náhrada nativního <select> u
 * velkých seznamů (subjekty, projekty, případy, úkoly). Nativní select hledá
 * jen podle začátku textu; tady se píše do pole a seznam se filtruje kdekoli
 * v názvu, bez ohledu na velikost písmen a diakritiku (src/lib/search-text.ts).
 *
 * Do formuláře odesílá skryté <input name={name}> se stejnou hodnotou jako
 * dřív select, takže server actions i GET filtry zůstávají beze změny.
 * Viditelné pole má roli combobox (ARIA 1.2) a je to první ovládací prvek
 * uvnitř <Field> labelu, takže ho popisek pojmenuje. Seznam je `position:
 * fixed` (neořízne ho rolovací tělo dialogu ani tabulka) a barvy má vlastní —
 * nezávisí na systémovém vzhledu nativního rozbalovacího menu.
 *
 * Ovládání: psaní filtruje, ↑/↓ posun, Enter / klik vybere, Esc zavře (a
 * nezavře přitom dialog), Tab po psaní vybere zvýrazněnou shodu. Smazání
 * textu a odchod z pole vybere prázdnou volbu, pokud je povolená.
 */
export function SearchableSelect({
  name,
  options,
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  placeholder = "Vyberte…",
  allowEmpty,
  required = false,
  disabled = false,
  id,
  form,
  className,
  "aria-label": ariaLabel,
  emptyMessage = "Nic nenalezeno.",
}: {
  name: string;
  options: readonly SearchableSelectOption[];
  /** Řízená hodnota (např. kaskáda klient → projekt → případ). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Text prázdné volby a nápověda v prázdném poli („Bez projektu“…). */
  placeholder?: string;
  /** Nabízet prázdnou volbu v seznamu; výchozí = když pole není povinné. */
  allowEmpty?: boolean;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  form?: string;
  className?: string;
  "aria-label"?: string;
  emptyMessage?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const listId = `${generatedId}-list`;
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = isControlled ? controlledValue : internalValue;
  const offerEmpty = allowEmpty ?? !required;

  // null = nepíše se, pole ukazuje název vybrané položky.
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<ListPosition | null>(null);
  // Seznam se vykresluje mimo <label> (jinak by se texty položek staly
  // součástí přístupného jména pole) — do <body>, v modálním dialogu do něj
  // (mimo dialog by byl seznam inertní).
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );
  const searchText = query ?? "";
  const { items, hidden } = useMemo(
    () =>
      searchableSelectItems(options, searchText, {
        emptyLabel: offerEmpty ? placeholder : null,
      }),
    [options, searchText, offerEmpty, placeholder],
  );

  const latest = useRef({ defaultValue, isControlled });
  useEffect(() => {
    latest.current = { defaultValue, isControlled };
  });

  function commit(next: string) {
    if (!isControlled) {
      setInternalValue(next);
    }
    if (next !== value) {
      onValueChange?.(next);
    }
    setQuery(null);
    setOpen(false);
  }

  function openList(nextQuery: string | null = query) {
    if (disabled) {
      return;
    }
    const nextItems = searchableSelectItems(options, nextQuery ?? "", {
      emptyLabel: offerEmpty ? placeholder : null,
    }).items;
    setActiveIndex(initialActiveIndex(nextItems, value, nextQuery ?? ""));
    setOpen(true);
  }

  function close(revert = true) {
    setOpen(false);
    if (revert) {
      setQuery(null);
    }
  }

  // Povinné pole: text bez vybrané položky formulář neodešle.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.setCustomValidity(
      required && !value && (query ?? "").trim()
        ? "Vyberte položku ze seznamu."
        : "",
    );
  }, [required, value, query]);

  // React 19 po úspěšné form action formulář resetuje (form.reset()) —
  // nativní select se vracel na výchozí volbu, tak i tady. Řízenou hodnotu
  // (kaskáda) drží rodič; skrytý input reset nezmění, takže zůstane shodná.
  useEffect(() => {
    const formElement = inputRef.current?.form;
    if (!formElement) {
      return;
    }
    function handleReset() {
      const { defaultValue: initial, isControlled: controlled } = latest.current;
      setQuery(null);
      setOpen(false);
      if (!controlled) {
        setInternalValue(initial);
      }
    }
    formElement.addEventListener("reset", handleReset);
    return () => formElement.removeEventListener("reset", handleReset);
  }, []);

  // Pozice seznamu (fixed) podle pole; při nedostatku místa dole se otevře nahoru.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    function update(event?: Event) {
      // Rolování uvnitř samotného seznamu pozici nemění.
      if (event?.target === listRef.current) {
        return;
      }
      const wrapper = wrapperRef.current;
      if (!wrapper) {
        return;
      }
      setPortalTarget(
        (wrapper.closest("dialog") as HTMLElement | null) ?? document.body,
      );
      const rect = wrapper.getBoundingClientRect();
      // Na úzkém displeji nesmí seznam přetéct vpravo z obrazovky.
      const width = Math.min(
        Math.max(rect.width, LIST_MIN_WIDTH),
        window.innerWidth - 16,
      );
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const flip = below < Math.min(LIST_MAX_HEIGHT, 200) && above > below;
      setPosition(
        flip
          ? { left, width, bottom: window.innerHeight - rect.top + 4 }
          : { left, width, top: rect.bottom + 4 },
      );
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // Zvýrazněná položka zůstává vidět.
  useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }
    const element = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    element?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (!open) {
          openList();
          return;
        }
        setActiveIndex((index) => Math.min(items.length - 1, index + 1));
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          openList();
          return;
        }
        setActiveIndex((index) => Math.max(0, index - 1));
        return;
      }
      case "Home":
      case "End": {
        if (open && items.length > 0 && query === null) {
          event.preventDefault();
          setActiveIndex(event.key === "Home" ? 0 : items.length - 1);
        }
        return;
      }
      case "Enter": {
        // Otevřený seznam: Enter vybírá, formulář neodesílá.
        if (open) {
          event.preventDefault();
          const item = items[activeIndex];
          if (item) {
            commit(itemValue(item));
          }
        }
        return;
      }
      case "Escape": {
        if (open || query !== null) {
          // preventDefault = Dialog se tímto Esc nezavře (viz ui/dialog.tsx).
          event.preventDefault();
          close();
        }
        return;
      }
      case "Tab": {
        if (open && query !== null && query.trim()) {
          const item = items[activeIndex];
          if (item) {
            commit(itemValue(item));
            return;
          }
        }
        close();
        return;
      }
      default:
        return;
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }
    if (query !== null && !query.trim() && offerEmpty) {
      commit("");
      return;
    }
    close();
  }

  const displayValue = query ?? selected?.label ?? "";
  const activeId =
    open && activeIndex >= 0 && activeIndex < items.length
      ? `${generatedId}-opt-${activeIndex}`
      : undefined;

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        form={form}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        className={controlClass}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          openList(next);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onClick={() => {
          if (!open) {
            openList();
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#566673]"
      />
      <input type="hidden" name={name} value={value} form={form} />
      {open && position && portalTarget ? createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: "fixed",
            left: position.left,
            width: position.width,
            top: position.top,
            bottom: position.bottom,
            maxHeight: LIST_MAX_HEIGHT,
          }}
          className="z-[60] overflow-y-auto rounded-md border border-[#dce4e8] bg-white py-1 text-sm text-[#1e2a35] shadow-lg"
          // Klik do seznamu nesmí vzít poli fokus.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => event.preventDefault()}
        >
          {items.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-[#566673]">
              {emptyMessage}
            </li>
          ) : null}
          {items.map((item, index) => {
            const group = groupStartsAt(items, index);
            return (
              <ListItem
                key={item.kind === "option" ? item.option.value : "__empty"}
                header={
                  group ? (
                    <li
                      role="presentation"
                      className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[#566673]"
                    >
                      {group}
                    </li>
                  ) : null
                }
                item={item}
                index={index}
                id={`${generatedId}-opt-${index}`}
                active={index === activeIndex}
                selected={itemValue(item) === value}
                onHover={() => setActiveIndex(index)}
                onChoose={() => commit(itemValue(item))}
              />
            );
          })}
          {hidden > 0 ? (
            <li role="presentation" className="px-3 py-2 text-xs text-[#566673]">
              Další shody: {hidden}. Upřesněte hledání.
            </li>
          ) : null}
        </ul>,
        portalTarget,
      ) : null}
    </div>
  );
}

/** Název skupiny, pokud položkou `index` začíná nová skupina; jinak null. */
function groupStartsAt(items: readonly SearchableSelectItem[], index: number) {
  const item = items[index];
  const group = item.kind === "option" ? item.option.group : undefined;
  if (!group) {
    return null;
  }
  const previous = index > 0 ? items[index - 1] : undefined;
  const previousGroup =
    previous?.kind === "option" ? previous.option.group : undefined;
  return group === previousGroup ? null : group;
}

function ListItem({
  header,
  item,
  index,
  id,
  active,
  selected,
  onHover,
  onChoose,
}: {
  header: React.ReactNode;
  item: SearchableSelectItem;
  index: number;
  id: string;
  active: boolean;
  selected: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  return (
    <>
      {header}
      <li
        id={id}
        role="option"
        aria-selected={selected}
        data-index={index}
        onMouseMove={active ? undefined : onHover}
        onClick={(event) => {
          event.preventDefault();
          onChoose();
        }}
        className={cn(
          "cursor-pointer px-3 py-2",
          active ? "bg-[#e7f3f3] text-[#0e1822]" : "text-[#1e2a35]",
          selected && "font-semibold",
          item.kind === "empty" && "text-[#566673]",
        )}
      >
        {item.kind === "option" ? (
          <>
            <span className="block">{item.option.label}</span>
            {item.option.description ? (
              <span className="block text-xs text-[#566673]">
                {item.option.description}
              </span>
            ) : null}
          </>
        ) : (
          item.label
        )}
      </li>
    </>
  );
}
