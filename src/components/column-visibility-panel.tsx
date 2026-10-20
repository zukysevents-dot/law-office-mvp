"use client";

import { RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import {
  resetTableViewPreference,
  updateTableViewPreference,
} from "@/app/actions/table-view-preferences";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormDoneWatcher } from "@/components/ui/form-done-watcher";
import type {
  TableColumnDefinition,
  TableKey,
} from "@/lib/table-view-preferences";

/**
 * "Sloupce" button + modal for choosing the visible table columns. The dialog
 * closes on ×, Escape, a click outside, and after saving (the table re-renders
 * right away — the server action revalidates the list page).
 */
export function ColumnVisibilityPanel({
  tableKey,
  columns,
  visibleColumns,
}: {
  tableKey: TableKey;
  columns: readonly TableColumnDefinition[];
  visibleColumns: string[];
}) {
  const [open, setOpen] = useState(false);
  const visibleColumnSet = new Set(visibleColumns);

  return (
    <div
      className="mb-4 flex"
      data-testid="column-visibility-panel"
      data-table-key={tableKey}
    >
      <Button
        type="button"
        variant="ghost"
        className="h-9 px-3"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Sloupce
        <span className="text-xs font-medium text-stone-600">
          {visibleColumns.length} / {columns.length}
        </span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Zobrazené sloupce"
        size="lg"
      >
        <form action={updateTableViewPreference} className="grid gap-4 p-4 sm:p-5">
          <input type="hidden" name="tableKey" value={tableKey} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((column) => (
              <label
                key={column.id}
                className="flex min-h-9 min-w-0 items-center gap-2 text-sm text-stone-700"
              >
                <input
                  type="checkbox"
                  name="columns"
                  value={column.id}
                  defaultChecked={visibleColumnSet.has(column.id)}
                  className="h-4 w-4 shrink-0 rounded border-stone-300 text-emerald-950"
                  data-testid="column-visibility-checkbox"
                />
                <span className="min-w-0 break-words">{column.label}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="submit"
              variant="ghost"
              formAction={resetTableViewPreference}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Obnovit výchozí
            </Button>
            <Button type="submit" variant="secondary" pendingLabel="Ukládám…">
              <Save className="h-4 w-4" aria-hidden="true" />
              Uložit sloupce
            </Button>
          </div>
          <FormDoneWatcher onDone={() => setOpen(false)} />
        </form>
      </Dialog>
    </div>
  );
}
