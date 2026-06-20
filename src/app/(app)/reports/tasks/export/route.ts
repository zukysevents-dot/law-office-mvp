import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { buildCsvBody, csvResponse } from "@/lib/export/csv";
import { buildXlsx, xlsxResponse, type XlsxColumn } from "@/lib/export/xlsx";
import { formatCaseLabel, formatDateUtc } from "@/lib/format";
import {
  taskDeadlineTypeLabels,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/lib/labels";
import { andWhere, taskVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_LIMIT = 10000;

// Tasks have no legalArea field, so this export intentionally omits it.
const HEADERS = [
  "Název",
  "Klient",
  "Projekt",
  "Případ",
  "Status",
  "Priorita",
  "Typ lhůty",
  "Řešitel",
  "Odpovědná osoba",
  "Vytvořil",
  "Začátek",
  "Deadline",
];

const XLSX_COLUMNS: XlsxColumn[] = [
  { header: "Název", key: "title", width: 32 },
  { header: "Klient", key: "subject", width: 24 },
  { header: "Projekt", key: "project", width: 24 },
  { header: "Případ", key: "case", width: 24 },
  { header: "Status", key: "status", width: 18 },
  { header: "Priorita", key: "priority", width: 14 },
  { header: "Typ lhůty", key: "deadlineType", width: 16 },
  { header: "Řešitel", key: "assignedTo", width: 20 },
  { header: "Odpovědná osoba", key: "responsibleUser", width: 20 },
  { header: "Vytvořil", key: "createdBy", width: 20 },
  { header: "Začátek", key: "startDate", width: 12 },
  { header: "Deadline", key: "deadline", width: 12 },
];

const exportInclude = {
  project: {
    select: { name: true, mainSubject: { select: { name: true } } },
  },
  case: {
    select: {
      name: true,
      fileNumber: true,
      project: { select: { mainSubject: { select: { name: true } } } },
    },
  },
  assignedTo: { select: { name: true } },
  responsibleUser: { select: { name: true } },
  createdBy: { select: { name: true } },
} as const;

type ExportTask = {
  project: { name: string; mainSubject: { name: string } } | null;
  case: {
    name: string;
    fileNumber: string | null;
    project: { mainSubject: { name: string } };
  } | null;
};

function subjectName(task: ExportTask) {
  return (
    task.project?.mainSubject.name ??
    task.case?.project.mainSubject.name ??
    ""
  );
}

function dateCell(value: Date | null) {
  return value ? formatDateUtc(value) : "";
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  const format = request.nextUrl.searchParams.get("format") === "csv"
    ? "csv"
    : "xlsx";

  let rows;
  try {
    const prisma = getPrisma();
    rows = await prisma.task.findMany({
      where: andWhere({ archivedAt: null }, taskVisibilityWhere(currentUser)),
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      include: exportInclude,
      take: EXPORT_LIMIT,
    });
    // Record the export before delivering data; an audit-write failure aborts
    // the export (graceful 503) so firm data is never exported unlogged.
    await writeAuditLog({
      entityType: "Task",
      entityId: "export",
      action: "EXPORT",
      changedById: currentUser.id,
      newValue: { format, count: rows.length },
    });
  } catch {
    return new Response("Databáze není připravena.", { status: 503 });
  }

  if (format === "csv") {
    const body = buildCsvBody(
      HEADERS,
      rows.map((row) => [
        row.title,
        subjectName(row),
        row.project?.name ?? "",
        formatCaseLabel(row.case, ""),
        taskStatusLabels[row.status],
        taskPriorityLabels[row.priority],
        taskDeadlineTypeLabels[row.deadlineType],
        row.assignedTo?.name ?? "",
        row.responsibleUser?.name ?? "",
        row.createdBy?.name ?? "",
        dateCell(row.startDate),
        dateCell(row.deadline),
      ]),
    );
    return csvResponse("ukoly.csv", body);
  }

  const buffer = await buildXlsx(
    XLSX_COLUMNS,
    rows.map((row) => ({
      title: row.title,
      subject: subjectName(row),
      project: row.project?.name ?? "",
      case: formatCaseLabel(row.case, ""),
      status: taskStatusLabels[row.status],
      priority: taskPriorityLabels[row.priority],
      deadlineType: taskDeadlineTypeLabels[row.deadlineType],
      assignedTo: row.assignedTo?.name ?? "",
      responsibleUser: row.responsibleUser?.name ?? "",
      createdBy: row.createdBy?.name ?? "",
      startDate: dateCell(row.startDate),
      deadline: dateCell(row.deadline),
    })),
    { sheetName: "Úkoly" },
  );
  return xlsxResponse("ukoly.xlsx", buffer);
}
