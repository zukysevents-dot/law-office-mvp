import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { buildCsvBody, csvNumber, csvResponse } from "@/lib/export/csv";
import { buildXlsx, xlsxResponse, type XlsxColumn } from "@/lib/export/xlsx";
import { formatCaseLabel, formatDateUtc } from "@/lib/format";
import { andWhere, referenceVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_LIMIT = 10000;

const HEADERS = [
  "Název",
  "Klient",
  "Projekt",
  "Případ",
  "Právní oblast",
  "Hodnota (CZK)",
  "Začátek",
  "Konec",
  "Popis",
];

const XLSX_COLUMNS: XlsxColumn[] = [
  { header: "Název", key: "title", width: 32 },
  { header: "Klient", key: "subject", width: 28 },
  { header: "Projekt", key: "project", width: 24 },
  { header: "Případ", key: "case", width: 24 },
  { header: "Právní oblast", key: "legalArea", width: 18 },
  { header: "Hodnota (CZK)", key: "value", width: 16, numFmt: "#,##0.00" },
  { header: "Začátek", key: "startDate", width: 12 },
  { header: "Konec", key: "endDate", width: 12 },
  { header: "Popis", key: "description", width: 40 },
];

const exportInclude = {
  subject: { select: { name: true } },
  project: { select: { name: true } },
  case: { select: { name: true, fileNumber: true } },
} as const;

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    rows = await prisma.reference.findMany({
      where: andWhere(
        { archivedAt: null },
        referenceVisibilityWhere(currentUser),
      ),
      orderBy: [{ endDate: "asc" }, { startDate: "desc" }],
      include: exportInclude,
      take: EXPORT_LIMIT,
    });
    // Record the export before delivering data; an audit-write failure aborts
    // the export (graceful 503) so firm data is never exported unlogged.
    await writeAuditLog({
      entityType: "Reference",
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
        row.subject?.name ?? "",
        row.project?.name ?? "",
        formatCaseLabel(row.case, ""),
        row.legalArea ?? "",
        csvNumber(toNumber(row.valueCzk)),
        dateCell(row.startDate),
        dateCell(row.endDate),
        row.description ?? "",
      ]),
    );
    return csvResponse("reference.csv", body);
  }

  const buffer = await buildXlsx(
    XLSX_COLUMNS,
    rows.map((row) => ({
      title: row.title,
      subject: row.subject?.name ?? "",
      project: row.project?.name ?? "",
      case: formatCaseLabel(row.case, ""),
      legalArea: row.legalArea ?? "",
      value: toNumber(row.valueCzk),
      startDate: dateCell(row.startDate),
      endDate: dateCell(row.endDate),
      description: row.description ?? "",
    })),
    { sheetName: "Reference" },
  );
  return xlsxResponse("reference.xlsx", buffer);
}
