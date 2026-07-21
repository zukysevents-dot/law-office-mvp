"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { globalSearch, type SearchHit } from "@/app/actions/search";

// F5: ⌘K / Ctrl-K global search. Results come from the globalSearch server
// action, which enforces per-user visibility — this component only renders them.
export function CommandPalette() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  function go(href: string) {
    dialogRef.current?.close();
    setQuery("");
    router.push(href);
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-lg rounded-xl p-0 backdrop:bg-black/40"
      onClose={() => setQuery("")}
    >
      <div className="border-b border-stone-200 p-3">
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat subjekt, projekt, případ, úkol…"
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
      </div>
      <ul className="max-h-80 overflow-y-auto p-2">
        {visibleHits.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-stone-400">
            {query.trim().length < 2 ? "Zadejte hledaný výraz" : "Žádné výsledky"}
          </li>
        ) : (
          visibleHits.map((hit) => (
            <li key={`${hit.type}:${hit.id}`}>
              <button
                type="button"
                onClick={() => go(hit.href)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-stone-100"
              >
                <span className="truncate font-medium">{hit.label}</span>
                <span className="shrink-0 text-xs text-stone-400">{hit.sub}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </dialog>
  );
}
