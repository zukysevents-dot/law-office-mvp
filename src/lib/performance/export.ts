// Sloupce a řádky XLSX exportu stránky Výkonnost. Čísla zůstávají čísly (Excel
// s nimi počítá), chybějící cíl / % / docházka = prázdná buňka.

import type { XlsxColumn } from "@/lib/export/xlsx";
import { userRoleLabels, workloadLevelLabels } from "@/lib/labels";
import type { PerformanceRow } from "@/lib/performance/metrics";

const BASE_COLUMNS: XlsxColumn[] = [
  { header: "Zaměstnanec", key: "name", width: 24 },
  { header: "Role", key: "role", width: 14 },
  { header: "Tým", key: "team", width: 20 },
  { header: "Hodiny celkem", key: "total", width: 14, numFmt: "0.00" },
  { header: "Cíl hodin celkem", key: "totalTarget", width: 16, numFmt: "0.00" },
  { header: "Plnění celkem (%)", key: "totalPct", width: 16, numFmt: "0" },
  { header: "Fakturovatelné hodiny", key: "billable", width: 20, numFmt: "0.00" },
  { header: "Cíl fakturovatelných", key: "billableTarget", width: 20, numFmt: "0.00" },
  { header: "Plnění fakturovatelných (%)", key: "billablePct", width: 24, numFmt: "0" },
  { header: "Z toho schváleno (h)", key: "approvedBillable", width: 18, numFmt: "0.00" },
  { header: "Nefakturovatelné hodiny", key: "nonBillable", width: 22, numFmt: "0.00" },
  { header: "Otevřené úkoly", key: "open", width: 14, numFmt: "0" },
  { header: "Po termínu", key: "overdue", width: 12, numFmt: "0" },
  { header: "Dokončené v období", key: "completed", width: 18, numFmt: "0" },
  { header: "Termíny do 14 dnů", key: "upcoming", width: 18, numFmt: "0" },
  { header: "Vytížení", key: "workload", width: 12 },
  { header: "Skóre vytížení", key: "workloadScore", width: 14, numFmt: "0" },
];

const HR_COLUMNS: XlsxColumn[] = [
  { header: "Odpracované dny", key: "workedDays", width: 16, numFmt: "0" },
  { header: "Odpracované hodiny", key: "workedHours", width: 18, numFmt: "0.00" },
  { header: "Absence (dny)", key: "absenceDays", width: 14, numFmt: "0.0" },
];

export function performanceXlsxColumns(options: { showHr: boolean }): XlsxColumn[] {
  return options.showHr ? [...BASE_COLUMNS, ...HR_COLUMNS] : BASE_COLUMNS;
}

export function performanceXlsxRows(
  rows: readonly PerformanceRow[],
  options: { showHr: boolean },
): Array<Record<string, string | number | null>> {
  return rows.map((row) => {
    const base: Record<string, string | number | null> = {
      name: row.name,
      role: userRoleLabels[row.role as keyof typeof userRoleLabels] ?? row.role,
      team: row.teamName ?? "",
      total: row.hours.total,
      totalTarget: row.totalTarget,
      totalPct: row.totalPct,
      billable: row.hours.billable,
      billableTarget: row.billableTarget,
      billablePct: row.billablePct,
      approvedBillable: row.hours.approvedBillable,
      nonBillable: row.hours.nonBillable,
      open: row.openTasks,
      overdue: row.overdueTasks,
      completed: row.completedTasks,
      upcoming: row.upcomingTotal,
      workload: workloadLevelLabels[row.workload],
      workloadScore: row.workloadScore,
    };
    if (!options.showHr) {
      return base;
    }
    const hasEmployee = Boolean(row.hr?.hasEmployee);
    return {
      ...base,
      workedDays: hasEmployee ? (row.hr?.workedDays ?? 0) : null,
      workedHours: hasEmployee ? (row.hr?.workedHours ?? 0) : null,
      absenceDays: hasEmployee ? (row.hr?.absence.days ?? 0) : null,
    };
  });
}

// ASCII název souboru (Content-Disposition).
export function performanceExportFilename(fromIso: string, toIso: string) {
  return `vykonnost-${fromIso}_${toIso}.xlsx`;
}
