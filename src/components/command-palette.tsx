"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { globalSearch, type SearchHit } from "@/app/actions/search";
import { Dialog } from "@/components/ui/dialog";

/** Event any component can dispatch to open the palette without a keyboard. */
export const OPEN_SEARCH_EVENT = "iuriverse:open-search";

// F5: ⌘K / Ctrl-K global search, rendered in the shared modal Dialog (closes
// on ×, Escape and a click outside — the outside click never activates what is
// underneath). Results come from the globalSearch server
// action, which enforces per-user visibility — this component only renders them.
export function CommandPalette() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isSearching, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    function openPalette() {
      setOpen(true);
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, openPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, openPalette);
    };
  }, []);

  useEffect(() => {
    const q = query;
    if (q.trim().length < 2) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        setHits(await globalSearch(q));
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Below the 2-char threshold there are no results — derive rather than store,
  // so the effect never has to clear state synchronously.
  const visibleHits = query.trim().length < 2 ? [] : hits;

  // Every close path (×, Escape, click outside, picking a result) goes here.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
    }
  }

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rychlé hledání"
      size="md"
      initialFocusRef={inputRef}
    >
      <div className="relative border-b border-[#dce4e8] p-3">
        <Search
          className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-[#566673]"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Hledat subjekt, projekt, případ nebo úkol"
          placeholder="Hledat subjekt, projekt, případ, úkol…"
          className="h-10 w-full rounded-md border border-[#dce4e8] pl-9 pr-3 text-sm outline-none transition focus:border-[#0e1822] focus:ring-2 focus:ring-[#0e1822]/20"
        />
      </div>
      {/* Results arrive asynchronously: without a live region a screen-reader
          user gets no signal that anything happened. */}
      <p role="status" aria-live="polite" className="sr-only">
        {query.trim().length < 2
          ? ""
          : isSearching
            ? "Hledám…"
            : `Nalezeno výsledků: ${visibleHits.length}`}
      </p>
      <ul className="max-h-80 overflow-y-auto p-2">
        {visibleHits.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-[#566673]">
            {query.trim().length < 2
              ? "Zadejte hledaný výraz"
              : isSearching
                ? "Hledám…"
                : "Žádné výsledky"}
          </li>
        ) : (
          visibleHits.map((hit) => (
            <li key={`${hit.type}:${hit.id}`}>
              <button
                type="button"
                onClick={() => go(hit.href)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-[#17A2A2]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17A2A2]"
              >
                <span className="truncate font-medium text-[#0e1822]">
                  {hit.label}
                </span>
                <span className="shrink-0 text-xs text-[#566673]">
                  {hit.sub}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </Dialog>
  );
}
