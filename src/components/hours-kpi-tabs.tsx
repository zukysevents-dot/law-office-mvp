"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Přepínač „Týden | Měsíc“ nad dvěma panely, které připravil server (bez
// fetchování). WAI-ARIA tabs: šipky vlevo/vpravo, Home/End.
export function HoursKpiTabs({
  tabs,
  label = "Období grafu",
}: {
  tabs: Array<{ id: string; label: string; content: ReactNode }>;
  label?: string;
}) {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    buttons.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(tabs.length - 1);
    }
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex w-fit rounded-md border border-[#dce4e8] bg-[#f6f8f9] p-0.5"
      >
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0e1822]",
                selected
                  ? "bg-white text-[#0e1822] shadow-sm"
                  : "text-[#566673] hover:text-[#0e1822]",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={index !== active}
          className="min-w-0"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
