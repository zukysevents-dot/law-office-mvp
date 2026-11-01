import type { NextRequest } from "next/server";

import { ModuleKey } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/entitlements";
import { buildCsvBody, csvNumber, csvResponse } from "@/lib/export/csv";
import { buildXlsx, xlsxResponse, type XlsxColumn } from "@/lib/export/xlsx";
import {
  ATTENDANCE_EXPORT_HEADERS,
  attendanceExportFilename,
  buildAttendanceExportRows,
  sumWorkedHours,
} from "@/lib/hr/attendance-export";
import {
  attendanceFilterWhere,
  readAttendanceFilters,
} from "@/lib/hr/attendance-filters";
import { hrAttendanceSourceLabels } from "@/lib/labels";
import { canAccessModule } from "@/lib/module-access.server";
import { andWhere, hrAttendanceVisibilityWhere } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPORT_LIMIT = 20000;

const XLSX_COLUMNS: XlsxColumn[] = [
  { header: "Datum", key: "date", width: 12 },
  { header: "Den", key: "weekday", width: 6 },
  { header: "Osobní číslo", key: "personalNumber", width: 14 },
  { header: "Zaměstnanec", key: "name", width: 26 },
  { header: "Příchod", key: "checkIn", width: 12 },
  { header: "Odchod", key: "checkOut", width: 12 },
  { header: "Přestávka (h)", key: "breakHours", width: 14, numFmt: "0.00" },
  { header: "Odpracováno (h)", key: "workedHours", width: 16, numFmt: "0.00" },
  { header: "Zdroj", key: "source", width: 10 },
  { header: "Poznámka", key: "note", width: 40 },
];

// Export záznamů docházky (CSV/XLSX) s filtrem období a zaměstnance — stejné
// parametry jako filtr na /hr/attendance. Správce HR exportuje kohokoli,
// ostatní jen vlastní záznamy (hrAttendanceVisibilityWhere).
export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (
    !(await canAccessModule(currentUser, "module.hr")) ||
    !(await isModuleEnabled(currentUser.organizationId, ModuleKey.HR_ATTENDANCE))
  ) {
    return new Response("Přístup odepřen.", { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const filters = readAttendanceFilters((key) => searchParams.get(key) ?? "");

  let records;
  try {
    const prisma = getPrisma();
    records = await prisma.hrAttendanceRecord.findMany({
      where: andWhere(
        attendanceFilterWhere(filters),
        hrAttendanceVisibilityWhere(currentUser),
      ),
      orderBy: [
        { employee: { lastName: "asc" } },
        { employee: { firstName: "asc" } },
        { workDate: "asc" },
      ],
      include: {
        employee: {
          select: { firstName: true, lastName: true, personalNumber: true },
        },
      },
      take: EXPORT_LIMIT,
    });
    // Export se zapíše do auditu dřív, než data odejdou; selhání auditu export
    // zastaví (503), aby data nikdy neodešla nezalogovaná.
    await writeAuditLog({
      organizationId: currentUser.organizationId,
      entityType: "HrAttendanceRecord",
      entityId: "export",
      action: "EXPORT",
      changedById: currentUser.id,
      newValue: { format, count: records.length, ...filters },
    });
  } catch {
    return new Response("Databáze není připravena.", { status: 503 });
  }

  const rows = buildAttendanceExportRows(
    records.map((record) => ({
      workDate: record.workDate,
      checkIn: record.checkIn,
      checkOut: record.checkOut,
      breakHours: Number(record.breakHours),
      workedHours: Number(record.workedHours),
      sourceLabel: hrAttendanceSourceLabels[record.source],
      note: record.note,
      employee: record.employee,
    })),
  );

  if (format === "csv") {
    const body = buildCsvBody(
      [...ATTENDANCE_EXPORT_HEADERS],
      rows.map((row) => [
        row.date,
        row.weekday,
        row.personalNumber,
        row.name,
        row.checkIn,
        row.checkOut,
        csvNumber(row.breakHours),
        csvNumber(row.workedHours),
        row.source,
        row.note,
      ]),
    );
    return csvResponse(attendanceExportFilename(filters, "csv"), body);
  }

  const buffer = await buildXlsx(
    XLSX_COLUMNS,
    [
      ...rows,
      // Součtový řádek jen v XLSX (CSV zůstává čistě strojově zpracovatelné).
      ...(rows.length > 0
        ? [{ name: "Celkem", workedHours: sumWorkedHours(rows) }]
        : []),
    ],
    { sheetName: "Docházka" },
  );
  return xlsxResponse(attendanceExportFilename(filters, "xlsx"), buffer);
}
