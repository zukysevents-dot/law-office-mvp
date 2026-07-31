"use client";

import { GripVertical } from "lucide-react";
import { useRef, useState, useTransition, type ReactNode } from "react";

import {
  saveDashboardWidgetOrder,
  saveDashboardWidgetSize,
} from "@/app/actions/dashboard-widgets";
import { DashboardWidgetSize } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type DashboardGridWidget = {
  id: string;
  title: string;
  type: string;
  size: DashboardWidgetSize;
  content: ReactNode;
};

const sizeClasses: Record<DashboardWidgetSize, string> = {
  SMALL: "lg:col-span-3",
  MEDIUM: "lg:col-span-12 2xl:col-span-6",
  LARGE: "lg:col-span-12 2xl:col-span-9",
  FULL: "lg:col-span-12",
};

const sizeLabels: Record<DashboardWidgetSize, string> = {
  SMALL: "Malý",
  MEDIUM: "Střední",
  LARGE: "Velký",
  FULL: "Celá šířka",
};

function reorder<T>(items: T[], from: number, to: number) {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function DashboardWidgetGrid({
  initialWidgets,
}: {
  initialWidgets: DashboardGridWidget[];
}) {
  const [widgets, setWidgets] = useState(initialWidgets);
  const [pending, startTransition] = useTransition();
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dragIndex = useRef<number | null>(null);

  function persistOrder(next: DashboardGridWidget[]) {
    setWidgets(next);
    startTransition(async () => {
      await saveDashboardWidgetOrder(next.map((widget) => widget.id));
    });
  }

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= widgets.length) {
      return;
    }
    const next = reorder(widgets, from, to);
    persistOrder(next);
    setAnnouncement(
      `${widgets[from].title}: nová pozice ${to + 1} z ${widgets.length}.`,
    );
  }

  function changeSize(id: string, size: DashboardWidgetSize) {
    setWidgets((current) =>
      current.map((widget) =>
        widget.id === id ? { ...widget, size } : widget,
      ),
    );
    startTransition(async () => {
      await saveDashboardWidgetSize(id, size);
    });
  }

  return (
    <div
      className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12"
      aria-busy={pending}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {widgets.map((widget, index) => (
        <article
          key={widget.id}
          onDragOver={(event) => {
            event.preventDefault();
            setOverIndex(index);
          }}
          onDragLeave={() =>
            setOverIndex((current) => (current === index ? null : current))
          }
          onDrop={(event) => {
            event.preventDefault();
            const from = dragIndex.current;
            dragIndex.current = null;
            setOverIndex(null);
            if (from !== null) {
              move(from, index);
            }
          }}
          className={cn(
            "min-w-0 rounded-lg transition",
            sizeClasses[widget.size],
            overIndex === index && "ring-2 ring-[#072924]/30 ring-offset-2",
          )}
          data-testid="dashboard-widget"
          data-widget-id={widget.id}
          data-widget-size={widget.size}
          data-widget-type={widget.type}
        >
          <div className="mb-1 flex items-center justify-end gap-2">
            <button
              type="button"
              draggable
              onDragStart={(event) => {
                dragIndex.current = index;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", widget.id);
              }}
              onDragEnd={() => {
                dragIndex.current = null;
                setOverIndex(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index, index - 1);
                }
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index, index + 1);
                }
              }}
              className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md border border-[#d4e2dc] bg-white text-[#5f756e] hover:bg-[#eef5f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#072924] active:cursor-grabbing"
              aria-label={`Přesunout widget ${widget.title}. Použijte přetažení nebo šipky.`}
              title="Přesunout widget"
            >
              <GripVertical className="h-4 w-4" aria-hidden="true" />
            </button>
            <select
              value={widget.size}
              onChange={(event) =>
                changeSize(widget.id, event.target.value as DashboardWidgetSize)
              }
              className="h-8 rounded-md border border-[#d4e2dc] bg-white px-2 text-xs text-[#5f756e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#072924]"
              aria-label={`Velikost widgetu ${widget.title}`}
            >
              {Object.values(DashboardWidgetSize).map((size) => (
                <option key={size} value={size}>
                  {sizeLabels[size]}
                </option>
              ))}
            </select>
          </div>
          {widget.content}
        </article>
      ))}
    </div>
  );
}
