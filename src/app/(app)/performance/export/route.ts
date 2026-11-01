import type { NextRequest } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { buildXlsx, xlsxResponse } from "@/lib/export/xlsx";
import { canAccessModule } from "@/lib/module-access.server";
import {
  performanceExportFilename,
  performanceXlsxColumns,
  performanceXlsxRows,
} from "@/lib/performance/export";
import { readPerformanceFilters } from "@/lib/performance/filters";
import {
  loadPerformanceOverview,
  type PerformanceOverview,
} from "@/lib/performance/load.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// XLSX export tabulky Výkonnost se stejnými filtry jako stránka. Přístup =
// modul Výkonnost; data jsou složená stejnými visibility helpery jako na
// stránce (HR sloupce jen se „Spravuje HR a docházku“).
export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!(await canAccessModule(currentUser, "module.performance"))) {
    return new Response("Přístup odepřen.", { status: 403 });
  }

  const filters = readPerformanceFilters((key) => request.nextUrl.searchParams.get(key));

  let overview: PerformanceOverview;
  try {
    overview = await loadPerformanceOverview(currentUser, filters, new Date());
    // Export se zaznamená před doručením dat; selhání auditu export zruší
    // (503), aby data kanceláře nikdy neodešla bez záznamu.
    await writeAuditLog({
      organizationId: currentUser.organizationId,
      entityType: "Performance",
      entityId: "export",
      action: "EXPORT",
      changedById: currentUser.id,
      newValue: {
        format: "xlsx",
        from: overview.period.fromIso,
        to: overview.period.toIso,
        count: overview.rows.length,
        filters: {
          teamId: filters.teamId,
          role: filters.role,
          userId: filters.userId,
        },
        hr: overview.showHr,
      },
    });
  } catch {
    return new Response("Databáze není připravena.", { status: 503 });
  }

  const options = { showHr: overview.showHr };
  const buffer = await buildXlsx(
    performanceXlsxColumns(options),
    performanceXlsxRows(overview.rows, options),
    { sheetName: "Výkonnost" },
  );
  return xlsxResponse(
    performanceExportFilename(overview.period.fromIso, overview.period.toIso),
    buffer,
  );
}
