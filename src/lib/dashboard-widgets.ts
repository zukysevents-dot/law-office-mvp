import {
  DashboardWidgetSize,
  DashboardWidgetType,
} from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";

export const dashboardWidgetTypes = [
  DashboardWidgetType.ACTIVE_TASKS,
  DashboardWidgetType.OVERDUE_TASKS,
  DashboardWidgetType.FOR_REVIEW_TASKS,
  DashboardWidgetType.WAITING_FOR_CLIENT_TASKS,
  DashboardWidgetType.WAITING_FOR_COUNTERPARTY_TASKS,
  DashboardWidgetType.MY_TASKS_TABLE,
  DashboardWidgetType.WORK_LOGS_SUMMARY,
  DashboardWidgetType.WORK_LOGS_TABLE,
  DashboardWidgetType.SUBJECTS_TABLE,
  DashboardWidgetType.PROJECTS_TABLE,
  DashboardWidgetType.CASES_TABLE,
  DashboardWidgetType.REFERENCES_TABLE,
  DashboardWidgetType.RECENT_CONFLICT_CHECKS,
  DashboardWidgetType.CALENDAR_PREVIEW,
  DashboardWidgetType.WEEKLY_HOURS_CHART,
] as const;

export const dashboardWidgetSizes = [
  DashboardWidgetSize.SMALL,
  DashboardWidgetSize.MEDIUM,
  DashboardWidgetSize.LARGE,
  DashboardWidgetSize.FULL,
] as const;

export const dashboardWidgetTypeLabels: Record<DashboardWidgetType, string> = {
  [DashboardWidgetType.ACTIVE_TASKS]: "Aktivní úkoly",
  [DashboardWidgetType.OVERDUE_TASKS]: "Úkoly po termínu",
  [DashboardWidgetType.FOR_REVIEW_TASKS]: "Ke kontrole",
  [DashboardWidgetType.WAITING_FOR_CLIENT_TASKS]: "Čeká na klienta",
  [DashboardWidgetType.WAITING_FOR_COUNTERPARTY_TASKS]: "Čeká na protistranu",
  [DashboardWidgetType.MY_TASKS_TABLE]: "Moje úkoly",
  [DashboardWidgetType.WORK_LOGS_SUMMARY]: "Hodiny tento měsíc",
  [DashboardWidgetType.WORK_LOGS_TABLE]: "Výkazy práce",
  [DashboardWidgetType.SUBJECTS_TABLE]: "Subjekty",
  [DashboardWidgetType.PROJECTS_TABLE]: "Projekty",
  [DashboardWidgetType.CASES_TABLE]: "Případy",
  [DashboardWidgetType.REFERENCES_TABLE]: "Reference",
  [DashboardWidgetType.RECENT_CONFLICT_CHECKS]: "Poslední conflict checky",
  [DashboardWidgetType.CALENDAR_PREVIEW]: "Kalendář",
  [DashboardWidgetType.WEEKLY_HOURS_CHART]: "Můj týden v hodinách",
};

export const dashboardWidgetSizeLabels: Record<DashboardWidgetSize, string> = {
  [DashboardWidgetSize.SMALL]: "Malý",
  [DashboardWidgetSize.MEDIUM]: "Střední",
  [DashboardWidgetSize.LARGE]: "Velký",
  [DashboardWidgetSize.FULL]: "Celá šířka",
};

export type DashboardTableColumn = {
  key: string;
  label: string;
};

export const dashboardTableColumns: Partial<
  Record<DashboardWidgetType, DashboardTableColumn[]>
> = {
  [DashboardWidgetType.MY_TASKS_TABLE]: [
    { key: "title", label: "Název" },
    { key: "subject", label: "Klient / subjekt" },
    { key: "project", label: "Projekt" },
    { key: "case", label: "Případ" },
    { key: "status", label: "Status" },
    { key: "deadline", label: "Deadline" },
    { key: "responsibleUser", label: "Odpovědná osoba" },
    { key: "assignedTo", label: "Řešitel" },
    { key: "priority", label: "Priorita" },
  ],
  [DashboardWidgetType.WORK_LOGS_TABLE]: [
    { key: "date", label: "Datum" },
    { key: "subject", label: "Subjekt" },
    { key: "project", label: "Projekt" },
    { key: "case", label: "Případ" },
    { key: "task", label: "Úkol" },
    { key: "user", label: "Pracovník" },
    { key: "hours", label: "Hodiny" },
    { key: "hourlyRate", label: "Sazba" },
    { key: "amount", label: "Částka" },
    { key: "description", label: "Popis" },
    { key: "legalArea", label: "Právní oblast" },
    { key: "billingStatus", label: "Billing status" },
    { key: "approvalStatus", label: "Approval status" },
  ],
  [DashboardWidgetType.SUBJECTS_TABLE]: [
    { key: "name", label: "Název" },
    { key: "type", label: "Typ" },
    { key: "ico", label: "IČO" },
    { key: "riskFlag", label: "Riziko" },
    { key: "status", label: "Stav" },
    { key: "createdAt", label: "Vytvořeno" },
  ],
  [DashboardWidgetType.PROJECTS_TABLE]: [
    { key: "name", label: "Název" },
    { key: "subject", label: "Klient / subjekt" },
    { key: "status", label: "Status" },
    { key: "responsibleUser", label: "Odpovědná osoba" },
    { key: "createdAt", label: "Vytvořeno" },
  ],
  [DashboardWidgetType.CASES_TABLE]: [
    { key: "name", label: "Název" },
    { key: "fileNumber", label: "Spisová značka" },
    { key: "project", label: "Projekt" },
    { key: "status", label: "Status" },
    { key: "responsibleUser", label: "Odpovědná osoba" },
    { key: "createdAt", label: "Vytvořeno" },
  ],
  [DashboardWidgetType.REFERENCES_TABLE]: [
    { key: "title", label: "Název" },
    { key: "legalArea", label: "Právní oblast" },
    { key: "value", label: "Hodnota" },
    { key: "period", label: "Období" },
    { key: "subject", label: "Subjekt" },
    { key: "project", label: "Projekt" },
    { key: "case", label: "Případ" },
    { key: "description", label: "Popis" },
  ],
};

const defaultTableColumns: Partial<Record<DashboardWidgetType, string[]>> = {
  [DashboardWidgetType.MY_TASKS_TABLE]: [
    "title",
    "subject",
    "status",
    "deadline",
    "responsibleUser",
  ],
  [DashboardWidgetType.WORK_LOGS_TABLE]: [
    "date",
    "subject",
    "hours",
    "amount",
    "billingStatus",
  ],
  [DashboardWidgetType.SUBJECTS_TABLE]: ["name", "type", "ico", "riskFlag"],
  [DashboardWidgetType.PROJECTS_TABLE]: [
    "name",
    "subject",
    "status",
    "responsibleUser",
  ],
  [DashboardWidgetType.CASES_TABLE]: [
    "name",
    "fileNumber",
    "project",
    "status",
  ],
  [DashboardWidgetType.REFERENCES_TABLE]: [
    "title",
    "legalArea",
    "value",
    "subject",
    "project",
  ],
};

// Stat-card widgets link to the matching filtered list so the dashboard boxes
// are clickable (lawyer request: "kliknu na po termínu a vidím úkoly po termínu").
export function dashboardWidgetHref(
  type: DashboardWidgetType,
): string | undefined {
  switch (type) {
    case DashboardWidgetType.ACTIVE_TASKS:
      return "/tasks";
    case DashboardWidgetType.OVERDUE_TASKS:
      return "/tasks?overdue=1";
    case DashboardWidgetType.FOR_REVIEW_TASKS:
      return "/tasks?status=FOR_REVIEW";
    case DashboardWidgetType.WAITING_FOR_CLIENT_TASKS:
      return "/tasks?status=WAITING_FOR_CLIENT";
    case DashboardWidgetType.WAITING_FOR_COUNTERPARTY_TASKS:
      return "/tasks?status=WAITING_FOR_COUNTERPARTY";
    case DashboardWidgetType.WORK_LOGS_SUMMARY:
      return "/work-logs";
    default:
      return undefined;
  }
}

export function isDashboardTableWidget(type: DashboardWidgetType) {
  return Boolean(dashboardTableColumns[type]);
}

export function getDefaultDashboardColumns(type: DashboardWidgetType) {
  return (
    defaultTableColumns[type] ??
    dashboardTableColumns[type]?.map((column) => column.key) ??
    []
  );
}

export function getVisibleDashboardColumns(
  type: DashboardWidgetType,
  config: unknown,
) {
  const fallback = getDefaultDashboardColumns(type);
  const availableColumns = new Set(
    dashboardTableColumns[type]?.map((column) => column.key) ?? [],
  );

  if (fallback.length === 0 || availableColumns.size === 0) {
    return [];
  }

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return fallback;
  }

  const columns = (config as { columns?: unknown }).columns;

  if (!Array.isArray(columns)) {
    return fallback;
  }

  const selectedColumns = columns.filter(
    (column): column is string =>
      typeof column === "string" && availableColumns.has(column),
  );

  return selectedColumns.length > 0 ? selectedColumns : fallback;
}

export function dashboardWidgetConfigForType(
  type: DashboardWidgetType,
  columns = getDefaultDashboardColumns(type),
) {
  return isDashboardTableWidget(type) ? { columns } : {};
}

export const defaultDashboardWidgets = [
  {
    type: DashboardWidgetType.ACTIVE_TASKS,
    title: "Aktivní úkoly",
    size: DashboardWidgetSize.SMALL,
  },
  {
    type: DashboardWidgetType.OVERDUE_TASKS,
    title: "Úkoly po termínu",
    size: DashboardWidgetSize.SMALL,
  },
  {
    type: DashboardWidgetType.FOR_REVIEW_TASKS,
    title: "Ke kontrole",
    size: DashboardWidgetSize.SMALL,
  },
  {
    type: DashboardWidgetType.SUBJECTS_TABLE,
    title: "Subjekty",
    size: DashboardWidgetSize.MEDIUM,
  },
  {
    type: DashboardWidgetType.PROJECTS_TABLE,
    title: "Projekty",
    size: DashboardWidgetSize.MEDIUM,
  },
  {
    type: DashboardWidgetType.WORK_LOGS_SUMMARY,
    title: "Hodiny tento měsíc",
    size: DashboardWidgetSize.SMALL,
  },
  {
    type: DashboardWidgetType.WEEKLY_HOURS_CHART,
    title: "Můj týden v hodinách",
    size: DashboardWidgetSize.MEDIUM,
  },
  {
    type: DashboardWidgetType.RECENT_CONFLICT_CHECKS,
    title: "Poslední conflict checky",
    size: DashboardWidgetSize.FULL,
  },
] as const;

export function defaultDashboardWidgetData(userId: string) {
  return defaultDashboardWidgets.map((widget, position) => ({
    userId,
    type: widget.type,
    title: widget.title,
    position,
    size: widget.size,
    visible: true,
    config: dashboardWidgetConfigForType(widget.type),
  }));
}

export async function ensureDefaultDashboardWidgets(userId: string) {
  const prisma = getPrisma();
  const existingWidgets = await prisma.dashboardWidget.count({
    where: { userId },
  });

  if (existingWidgets > 0) {
    return;
  }

  await prisma.dashboardWidget.createMany({
    data: defaultDashboardWidgetData(userId),
  });
}
