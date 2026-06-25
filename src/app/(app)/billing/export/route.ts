import type { NextRequest } from "next/server";

import ExcelJS from "exceljs";

import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  billingFilterWhere,
  billingWorkLogInclude,
  invoiceableWorkLogWhere,
  readBillingFilters,
  type BillingWorkLog,
} from "@/lib/billing";
import { formatCaseLabel, formatDateUtc } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { andWhere, workLogVisibilityWhere } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "Datum",
  "Klient",
  "Projekt",
  "Případ",
  "Pracovník",
  "Hodiny",
  "Sazba",
  "Částka (CZK)",
  "Právní oblast",
  "Popis",
];

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function csvCell(value: string) {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvNumber(value: number | null) {
  // Czech Excel convention: comma decimal separator, ; column separator.
  return value === null ? "" : value.toFixed(2).replace(".", ",");
}

function buildCsv(rows: BillingWorkLog[]) {
  const lines = [HEADERS.map(csvCell).join(";")];
  for (const row of rows) {
    lines.push(
      [
        formatDateUtc(row.workDate),
        row.subject?.name ?? "",
        row.project?.name ?? "",
        formatCaseLabel(row.case, ""),
        row.user?.name ?? "",
        csvNumber(toNumber(row.hours)),
        csvNumber(toNumber(row.hourlyRate)),
        csvNumber(toNumber(row.amountCzk)),
        row.legalArea ?? "",
        row.description ?? "",
      ]
        .map((cell) => csvCell(String(cell)))
        .join(";"),
    );
  }
  // UTF-8 BOM so Excel (cs-CZ) detects encoding correctly.
  return `﻿${lines.join("\r\n")}`;
}

async function buildXlsx(rows: BillingWorkLog[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Fakturační podklady");

  sheet.columns = [
    { header: "Datum", key: "date", width: 12 },
    { header: "Klient", key: "subject", width: 28 },
    { header: "Projekt", key: "project", width: 24 },
    { header: "Případ", key: "case", width: 24 },
    { header: "Pracovník", key: "user", width: 20 },
    { header: "Hodiny", key: "hours", width: 10 },
    { header: "Sazba", key: "rate", width: 12 },
    { header: "Částka (CZK)", key: "amount", width: 14 },
    { header: "Právní oblast", key: "legalArea", width: 18 },
    { header: "Popis", key: "description", width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      // Write the date as a preformatted UTC string so the .xlsx never shifts
      // the calendar day via ExcelJS's local-timezone serial conversion.
      date: formatDateUtc(row.workDate),
      subject: row.subject?.name ?? "",
      project: row.project?.name ?? "",
      case: formatCaseLabel(row.case, ""),
      user: row.user?.name ?? "",
      hours: toNumber(row.hours),
      rate: toNumber(row.hourlyRate),
      amount: toNumber(row.amountCzk),
      legalArea: row.legalArea ?? "",
      description: row.description ?? "",
    });
  }

  const totalHours = rows.reduce((sum, row) => sum + (toNumber(row.hours) ?? 0), 0);
  const totalAmount = rows.reduce(
    (sum, row) => sum + (toNumber(row.amountCzk) ?? 0),
    0,
  );
  const totalRow = sheet.addRow({
    user: "Celkem",
    hours: totalHours,
    amount: totalAmount,
  });
  totalRow.font = { bold: true };

  sheet.getColumn("hours").numFmt = "0.00";
  sheet.getColumn("rate").numFmt = "#,##0.00";
  sheet.getColumn("amount").numFmt = "#,##0.00";

  return workbook.xlsx.writeBuffer();
}

export async function GET(request: NextRequest) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const filters = readBillingFilters((key) => searchParams.get(key) ?? "");

  const rows: BillingWorkLog[] = await prisma.workLog.findMany({
    where: andWhere(
      invoiceableWorkLogWhere,
      workLogVisibilityWhere(currentUser),
      billingFilterWhere(filters),
    ),
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    include: billingWorkLogInclude,
  });

  if (format === "csv") {
    return new Response(buildCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="fakturacni-podklady.csv"',
      },
    });
  }

  const buffer = await buildXlsx(rows);
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="fakturacni-podklady.xlsx"',
    },
  });
}
