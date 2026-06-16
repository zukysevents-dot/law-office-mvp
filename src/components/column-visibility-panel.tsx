import { Save, SlidersHorizontal } from "lucide-react";

import { updateTableViewPreference } from "@/app/actions/table-view-preferences";
import { Button } from "@/components/ui/button";
import type {
  TableColumnDefinition,
  TableKey,
} from "@/lib/table-view-preferences";

export function ColumnVisibilityPanel({
  tableKey,
  columns,
  visibleColumns,
}: {
  tableKey: TableKey;
  columns: readonly TableColumnDefinition[];
  visibleColumns: string[];
}) {
  const visibleColumnSet = new Set(visibleColumns);

  return (
    <details
      className="mb-4 rounded-md border border-[#d4e2dc] bg-[#f8fbf9] p-4"
      data-testid="column-visibility-panel"
      data-table-key={tableKey}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[#072924]">
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Sloupce
        </span>
        <span className="text-xs font-medium text-stone-600">
          {visibleColumns.length} / {columns.length}
        </span>
      </summary>
      <form action={updateTableViewPreference} className="mt-4 grid gap-4">
        <input type="hidden" name="tableKey" value={tableKey} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {columns.map((column) => (
            <label
              key={column.id}
              className="flex min-w-0 items-center gap-2 text-sm text-stone-700"
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
        <div>
          <Button type="submit" variant="secondary">
            <Save className="h-4 w-4" aria-hidden="true" />
            Uložit sloupce
          </Button>
        </div>
      </form>
    </details>
  );
}
