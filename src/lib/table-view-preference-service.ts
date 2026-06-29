import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  getDefaultTableColumns,
  getDefaultTableView,
  normalizeVisibleColumns,
  tableViewConfigs,
  type TableKey,
  type TableViewState,
} from "@/lib/table-view-preferences";

export async function getTableViewPreference(
  userId: string,
  tableKey: TableKey,
  defaultColumns = getDefaultTableColumns(tableKey),
) {
  const prisma = getPrisma();
  const preference = await prisma.tableViewPreference.findUnique({
    where: {
      userId_tableKey: {
        userId,
        tableKey,
      },
    },
    select: {
      visibleColumns: true,
    },
  });

  return normalizeVisibleColumns(
    preference?.visibleColumns,
    tableViewConfigs[tableKey].columns,
    defaultColumns,
  );
}

export async function upsertTableViewPreference(
  userId: string,
  tableKey: TableKey,
  visibleColumns: unknown,
) {
  const prisma = getPrisma();
  const normalizedColumns = normalizeVisibleColumns(
    visibleColumns,
    tableViewConfigs[tableKey].columns,
    getDefaultTableColumns(tableKey),
  );

  await prisma.tableViewPreference.upsert({
    where: {
      userId_tableKey: {
        userId,
        tableKey,
      },
    },
    update: {
      visibleColumns: normalizedColumns,
    },
    create: {
      userId,
      tableKey,
      visibleColumns: normalizedColumns,
    },
  });

  return normalizedColumns;
}

export async function getCurrentTableView(
  tableKey: TableKey,
): Promise<TableViewState> {
  const currentUser = await getCurrentUser();

  return {
    columns: tableViewConfigs[tableKey].columns,
    visibleColumns: await getTableViewPreference(currentUser.id, tableKey),
  };
}

// Drop specific columns from a resolved table view (both the column list that
// drives the header/picker and the visible set). Used to enforce role-based
// hiding of rate/amount columns without touching the user's stored preference.
export function restrictTableView(
  view: TableViewState,
  hiddenColumnIds: readonly string[],
): TableViewState {
  if (hiddenColumnIds.length === 0) {
    return view;
  }

  const hidden = new Set(hiddenColumnIds);

  return {
    columns: view.columns.filter((column) => !hidden.has(column.id)),
    visibleColumns: view.visibleColumns.filter((id) => !hidden.has(id)),
  };
}

export { getDefaultTableView };
