"use client";

import { GripVertical } from "lucide-react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { saveDashboardLayout } from "@/app/actions/dashboard-widgets";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type EditorColumn = { key: string; label: string; selected: boolean };

export type EditorWidget = {
  id: string;
  typeLabel: string;
  title: string;
  size: string;
  visible: boolean;
  isTable: boolean;
  columns: EditorColumn[];
};

type SizeOption = { value: string; label: string };

function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} data-testid="dashboard-layout-save">
      {pending ? "Ukládám…" : "Uložit rozložení"}
    </Button>
  );
}

export function DashboardLayoutEditor({
  widgets: initialWidgets,
  sizes,
}: {
  widgets: EditorWidget[];
  sizes: SizeOption[];
}) {
  const [widgets, setWidgets] = useState<EditorWidget[]>(initialWidgets);
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleDrop(targetIndex: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from === null || from === targetIndex) {
      return;
    }
    setWidgets((current) => reorder(current, from, targetIndex));
  }

  function patch(id: string, change: Partial<EditorWidget>) {
    setWidgets((current) =>
      current.map((widget) =>
        widget.id === id ? { ...widget, ...change } : widget,
      ),
    );
  }

  function toggleColumn(id: string, key: string, selected: boolean) {
    setWidgets((current) =>
      current.map((widget) =>
        widget.id === id
          ? {
              ...widget,
              columns: widget.columns.map((column) =>
                column.key === key ? { ...column, selected } : column,
              ),
            }
          : widget,
      ),
    );
  }

  // Serialized state the single server action consumes (order = array order).
  const payload = JSON.stringify(
    widgets.map((widget) => ({
      id: widget.id,
      title: widget.title,
      size: widget.size,
      visible: widget.visible,
      columns: widget.columns.filter((c) => c.selected).map((c) => c.key),
    })),
  );

  if (widgets.length === 0) {
    return null;
  }

  return (
    <form action={saveDashboardLayout} className="grid min-w-0 gap-4">
      <input type="hidden" name="payload" value={payload} />
      <p className="text-sm text-[#5f756e]">
        Pořadí změníte přetažením widgetu za úchyt. Změny se uloží najednou
        tlačítkem níže.
      </p>

      {widgets.map((widget, index) => (
        <article
          key={widget.id}
          draggable
          onDragStart={() => {
            dragIndex.current = index;
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setOverIndex(index);
          }}
          onDragLeave={() => setOverIndex((cur) => (cur === index ? null : cur))}
          onDrop={(event) => {
            event.preventDefault();
            handleDrop(index);
          }}
          className={`min-w-0 rounded-lg border bg-[#EEF5F1]/45 p-4 ${
            overIndex === index
              ? "border-[#072924] ring-2 ring-[#072924]/20"
              : "border-[#d4e2dc]"
          }`}
          data-testid="dashboard-widget-setting"
          data-widget-id={widget.id}
          data-widget-position={index}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="mt-1 cursor-grab text-stone-400 active:cursor-grabbing"
              aria-hidden="true"
              title="Přetáhněte pro změnu pořadí"
            >
              <GripVertical className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[#072924]">
                  {widget.title || widget.typeLabel}
                </h3>
                <Badge tone={widget.visible ? "mint" : "neutral"}>
                  {widget.visible ? "Viditelný" : "Skrytý"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-[#5f756e]">
                {widget.typeLabel} · pořadí {index + 1}
              </p>

              <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[1fr_220px_160px]">
                <Field label="Název">
                  <TextInput
                    value={widget.title}
                    onChange={(event) =>
                      patch(widget.id, { title: event.target.value })
                    }
                    data-testid="dashboard-widget-title"
                  />
                </Field>
                <Field label="Velikost">
                  <SelectInput
                    value={widget.size}
                    onChange={(event) =>
                      patch(widget.id, { size: event.target.value })
                    }
                    data-testid="dashboard-widget-size"
                  >
                    {sizes.map((size) => (
                      <option key={size.value} value={size.value}>
                        {size.label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <label className="flex items-end gap-2 pb-2 text-sm font-medium text-[#072924]">
                  <input
                    type="checkbox"
                    checked={widget.visible}
                    onChange={(event) =>
                      patch(widget.id, { visible: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-[#cfe0d7]"
                    data-testid="dashboard-widget-visible"
                  />
                  Zobrazit
                </label>
              </div>

              {widget.isTable && widget.columns.length > 0 ? (
                <div className="mt-3 min-w-0">
                  <p className="mb-2 text-sm font-medium text-[#072924]">
                    Viditelné sloupce
                  </p>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {widget.columns.map((column) => (
                      <label
                        key={column.key}
                        className="flex min-w-0 items-center gap-2 text-sm text-stone-700"
                      >
                        <input
                          type="checkbox"
                          checked={column.selected}
                          onChange={(event) =>
                            toggleColumn(widget.id, column.key, event.target.checked)
                          }
                          className="h-4 w-4 shrink-0 rounded border-[#cfe0d7]"
                          data-testid="dashboard-widget-column"
                        />
                        <span className="min-w-0 truncate">{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </article>
      ))}

      <div>
        <SaveButton />
      </div>
    </form>
  );
}
