import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { buildCsvBody, csvNumber, csvResponse } from "@/lib/export/csv";
import { buildXlsx, xlsxResponse, type XlsxColumn } from "@/lib/export/xlsx";
import { formatCaseLabel, formatDateUtc } from "@/lib/format";
import { billingStatusLabels } from "@/lib/labels";
import { andWhere, workLogVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { readReportFilters, workLogReportWhere } from "@/lib/reporting/filters";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_LIMIT = 10000;

const HEADERS = [
  "Datum",
  "Klient",
  "Projekt",
  "Případ",
  "Pracovník",
  "Hodiny",
  "Sazba",
  "Částka (CZK)",
  "Fakturační stav",
  "Právní oblast",
  "Popis",
];

const XLSX_COLUMNS: XlsxColumn[] = [
  { header: "Datum", key: "date", width: 12 },
  { header: "Klient", key: "subject", width: 28 },
  { header: "Projekt", key: "project", width: 24 },
  { header: "Případ", key: "case", width: 24 },
  { header: "Pracovník", key: "user", width: 20 },
  { header: "Hodiny", key: "hours", width: 10, numFmt: "0.00" },
  { header: "Sazba", key: "rate", width: 12, numFmt: "#,##0.00" },
  { header: "Částka (CZK)", key: "amount", width: 14, numFmt: "#,##0.00" },
  { header: "Fakturační stav", key: "billingStatus", width: 22 },
  { header: "Právní oblast", key: "legalArea", width: 18 },
  { header: "Popis", key: "description", width: 40 },
];

const exportInclude = {
  subject: { select: { name: true } },
  project: { select: { name: true } },
  case: { select: { name: true, fileNumber: true } },
  user: { select: { name: true } },
} as const;

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const filters = readReportFilters((key) => searchParams.get(key) ?? "");

  let rows;
  try {
    const prisma = getPrisma();
    rows = await prisma.workLog.findMany({
      where: andWhere(
        workLogReportWhere(filters),
        workLogVisibilityWhere(currentUser),
      ),
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      include: exportInclude,
      take: EXPORT_LIMIT,
    });
    // Record the export before delivering data; an audit-write failure aborts
    // the export (graceful 503) so firm data is never exported unlogged.
    await writeAuditLog({
      entityType: "WorkLog",
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
        formatDateUtc(row.workDate),
        row.subject?.name ?? "",
        row.project?.name ?? "",
        formatCaseLabel(row.case, ""),
        row.user?.name ?? "",
        csvNumber(toNumber(row.hours)),
        csvNumber(toNumber(row.hourlyRate)),
        csvNumber(toNumber(row.amountCzk)),
        billingStatusLabels[row.billingStatus],
        row.legalArea ?? "",
        row.description ?? "",
      ]),
    );
    return csvResponse("vykazy-prace.csv", body);
  }

  const buffer = await buildXlsx(
    XLSX_COLUMNS,
    rows.map((row) => ({
      date: formatDateUtc(row.workDate),
      subject: row.subject?.name ?? "",
      project: row.project?.name ?? "",
      case: formatCaseLabel(row.case, ""),
      user: row.user?.name ?? "",
      hours: toNumber(row.hours),
      rate: toNumber(row.hourlyRate),
      amount: toNumber(row.amountCzk),
      billingStatus: billingStatusLabels[row.billingStatus],
      legalArea: row.legalArea ?? "",
      description: row.description ?? "",
    })),
    { sheetName: "Výkazy práce" },
  );
  return xlsxResponse("vykazy-prace.xlsx", buffer);
}
