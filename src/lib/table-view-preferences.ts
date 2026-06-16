export type TableColumnDefinition = {
  id: string;
  label: string;
  defaultVisible: boolean;
};

type TableViewConfig = {
  label: string;
  path: string;
  columns: readonly TableColumnDefinition[];
};

export const tableViewConfigs = {
  tasks: {
    label: "Úkoly",
    path: "/tasks",
    columns: [
      { id: "title", label: "Název úkolu", defaultVisible: true },
      { id: "subject", label: "Klient / subjekt", defaultVisible: true },
      { id: "project", label: "Projekt", defaultVisible: true },
      { id: "case", label: "Případ", defaultVisible: true },
      { id: "createdBy", label: "Vytvořil", defaultVisible: false },
      { id: "assignee", label: "Řešitel", defaultVisible: true },
      {
        id: "responsiblePerson",
        label: "Odpovědná osoba",
        defaultVisible: true,
      },
      { id: "status", label: "Status", defaultVisible: true },
      { id: "priority", label: "Priorita", defaultVisible: true },
      { id: "deadlineType", label: "Typ lhůty", defaultVisible: true },
      { id: "startDate", label: "Datum zahájení", defaultVisible: true },
      { id: "deadline", label: "Deadline", defaultVisible: true },
      { id: "sharePointUrl", label: "SharePoint URL", defaultVisible: false },
      { id: "createdAt", label: "Vytvořeno", defaultVisible: false },
      { id: "updatedAt", label: "Aktualizováno", defaultVisible: false },
    ],
  },
  workLogs: {
    label: "Výkazy práce",
    path: "/work-logs",
    columns: [
      { id: "date", label: "Datum", defaultVisible: true },
      { id: "subject", label: "Subjekt", defaultVisible: true },
      { id: "project", label: "Projekt", defaultVisible: true },
      { id: "case", label: "Případ", defaultVisible: true },
      { id: "task", label: "Úkol", defaultVisible: true },
      { id: "worker", label: "Pracovník", defaultVisible: true },
      { id: "hours", label: "Hodiny", defaultVisible: true },
      { id: "hourlyRate", label: "Sazba", defaultVisible: true },
      { id: "amount", label: "Částka", defaultVisible: true },
      { id: "description", label: "Popis", defaultVisible: false },
      { id: "legalArea", label: "Právní oblast", defaultVisible: true },
      { id: "billingStatus", label: "Billing status", defaultVisible: true },
      { id: "approvalStatus", label: "Approval status", defaultVisible: true },
      { id: "createdAt", label: "Vytvořeno", defaultVisible: false },
      { id: "updatedAt", label: "Aktualizováno", defaultVisible: false },
    ],
  },
  subjects: {
    label: "Subjekty",
    path: "/subjects",
    columns: [
      { id: "name", label: "Název", defaultVisible: true },
      { id: "type", label: "Typ", defaultVisible: true },
      { id: "ico", label: "IČO", defaultVisible: true },
      { id: "dic", label: "DIČ", defaultVisible: true },
      { id: "address", label: "Adresa", defaultVisible: false },
      { id: "legalForm", label: "Právní forma", defaultVisible: false },
      { id: "statutoryBody", label: "Statutární orgán", defaultVisible: false },
      { id: "status", label: "Stav", defaultVisible: true },
      {
        id: "insolvencyStatus",
        label: "Insolvenční stav",
        defaultVisible: false,
      },
      { id: "riskFlag", label: "Rizikový příznak", defaultVisible: true },
      { id: "feeType", label: "Typ odměny", defaultVisible: true },
      { id: "hourlyRate", label: "Hodinová sazba", defaultVisible: true },
      { id: "flatFee", label: "Paušální odměna", defaultVisible: false },
      { id: "createdAt", label: "Vytvořeno", defaultVisible: true },
      { id: "updatedAt", label: "Aktualizováno", defaultVisible: false },
    ],
  },
  projects: {
    label: "Projekty",
    path: "/projects",
    columns: [
      { id: "name", label: "Název", defaultVisible: true },
      { id: "mainSubject", label: "Hlavní subjekt", defaultVisible: true },
      {
        id: "responsibleUser",
        label: "Odpovědný uživatel",
        defaultVisible: true,
      },
      { id: "status", label: "Status", defaultVisible: true },
      { id: "hourlyRate", label: "Hodinová sazba", defaultVisible: true },
      { id: "sharePointUrl", label: "SharePoint URL", defaultVisible: true },
      { id: "note", label: "Poznámka", defaultVisible: false },
      { id: "createdAt", label: "Vytvořeno", defaultVisible: true },
      { id: "updatedAt", label: "Aktualizováno", defaultVisible: false },
    ],
  },
  cases: {
    label: "Případy",
    path: "/cases",
    columns: [
      { id: "name", label: "Název", defaultVisible: true },
      { id: "project", label: "Projekt", defaultVisible: true },
      { id: "fileNumber", label: "Spisová značka", defaultVisible: true },
      {
        id: "responsibleUser",
        label: "Odpovědný uživatel",
        defaultVisible: true,
      },
      { id: "status", label: "Status", defaultVisible: true },
      { id: "sharePointUrl", label: "SharePoint URL", defaultVisible: true },
      { id: "note", label: "Poznámka", defaultVisible: false },
      { id: "createdAt", label: "Vytvořeno", defaultVisible: true },
      { id: "updatedAt", label: "Aktualizováno", defaultVisible: false },
    ],
  },
  references: {
    label: "Reference",
    path: "/references",
    columns: [
      { id: "title", label: "Název", defaultVisible: true },
      { id: "subject", label: "Subjekt", defaultVisible: true },
      { id: "project", label: "Projekt", defaultVisible: true },
      { id: "case", label: "Případ", defaultVisible: true },
      { id: "legalArea", label: "Právní oblast", defaultVisible: true },
      { id: "valueCzk", label: "Hodnota v Kč", defaultVisible: true },
      { id: "startDate", label: "Začátek", defaultVisible: true },
      { id: "endDate", label: "Konec", defaultVisible: true },
      { id: "status", label: "Stav", defaultVisible: true },
      { id: "description", label: "Popis", defaultVisible: false },
      { id: "createdAt", label: "Vytvořeno", defaultVisible: false },
      { id: "updatedAt", label: "Aktualizováno", defaultVisible: false },
    ],
  },
} satisfies Record<string, TableViewConfig>;

export type TableKey = keyof typeof tableViewConfigs;

export type TableViewState = {
  columns: readonly TableColumnDefinition[];
  visibleColumns: string[];
};

export function isTableKey(value: unknown): value is TableKey {
  return typeof value === "string" && value in tableViewConfigs;
}

export function getDefaultVisibleColumns(
  columns: readonly TableColumnDefinition[],
) {
  return columns
    .filter((column) => column.defaultVisible)
    .map((column) => column.id);
}

export function getDefaultTableColumns(tableKey: TableKey) {
  return getDefaultVisibleColumns(tableViewConfigs[tableKey].columns);
}

export function getDefaultTableView(tableKey: TableKey): TableViewState {
  return {
    columns: tableViewConfigs[tableKey].columns,
    visibleColumns: getDefaultTableColumns(tableKey),
  };
}

export function normalizeVisibleColumns(
  savedColumns: unknown,
  allColumns: readonly TableColumnDefinition[],
  defaultColumns: readonly string[],
) {
  const availableColumns = allColumns.map((column) => column.id);
  const fallback = defaultColumns.filter((column) =>
    availableColumns.includes(column),
  );

  if (!Array.isArray(savedColumns)) {
    return fallback;
  }

  const hasStaleColumns = savedColumns.some(
    (column) => typeof column === "string" && !availableColumns.includes(column),
  );
  const selectedColumns = new Set(
    savedColumns.filter(
      (column): column is string =>
        typeof column === "string" && availableColumns.includes(column),
    ),
  );

  if (hasStaleColumns) {
    for (const column of fallback) {
      selectedColumns.add(column);
    }
  }

  const orderedColumns = availableColumns.filter((column) =>
    selectedColumns.has(column),
  );

  return orderedColumns.length > 0 ? orderedColumns : fallback;
}

export function getVisibleTableColumns(
  tableKey: TableKey,
  visibleColumns: unknown,
) {
  return normalizeVisibleColumns(
    visibleColumns,
    tableViewConfigs[tableKey].columns,
    getDefaultTableColumns(tableKey),
  );
}

export function defaultTableViewPreferenceData(userId: string) {
  return Object.entries(tableViewConfigs).map(([tableKey, config]) => ({
    userId,
    tableKey,
    visibleColumns: getDefaultVisibleColumns(config.columns),
  }));
}
