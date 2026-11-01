import type { NextRequest } from "next/server";

import {
  auditActionLabel,
  auditEntityTypeLabel,
  buildAuditWhere,
  readAuditFilters,
} from "@/lib/audit-filters";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatPermissionAudit } from "@/lib/permission-audit";
import { auditRowForViewer } from "@/lib/audit-redact";
import { andWhere, canViewAuditLog, canViewRates } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { canAccessModule } from "@/lib/module-access.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "Datum a čas",
  "Uživatel",
  "E-mail",
  "Akce",
  "Entita",
  "ID entity",
  "Detail",
];

function csvCell(value: string) {
  // Neutralize spreadsheet formula injection: a leading =, +, -, or @ can be
  // interpreted as a formula by Excel/Sheets when the file is opened.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[";\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

type AuditLogRow = {
  entityType: string;
  entityId: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: Date;
  changedBy: { name: string; email: string } | null;
};

function auditDetail(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  return JSON.stringify(value);
}

function buildCsv(rows: AuditLogRow[]) {
  const lines = [HEADERS.map(csvCell).join(";")];
  for (const row of rows) {
    lines.push(
      [
        formatDateTime(row.createdAt),
        row.changedBy?.name ?? "",
        row.changedBy?.email ?? "",
        auditActionLabel(row.action),
        auditEntityTypeLabel(row.entityType),
        row.entityId,
        formatPermissionAudit(row) ?? auditDetail(row.newValue ?? row.oldValue),
      ]
        .map((cell) => csvCell(String(cell)))
        .join(";"),
    );
  }
  // UTF-8 BOM so Excel (cs-CZ) detects encoding correctly.
  return `﻿${lines.join("\r\n")}`;
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!(await canAccessModule(currentUser, "module.auditLog"))) {
    return new Response("Přístup odepřen.", { status: 403 });
  }

  if (!canViewAuditLog(currentUser)) {
    return new Response("Přístup odepřen", { status: 403 });
  }

  const filters = readAuditFilters(
    (key) => request.nextUrl.searchParams.get(key) ?? "",
  );

  let rows: AuditLogRow[];
  try {
    const prisma = getPrisma();
    rows = await prisma.auditLog.findMany({
      where: andWhere(buildAuditWhere(filters), {
        organizationId: currentUser.organizationId,
      }),
      orderBy: { createdAt: "desc" },
      take: 10000,
      include: {
        changedBy: { select: { name: true, email: true } },
      },
    });
  } catch {
    return new Response("Databáze není připravena.", { status: 503 });
  }

  // Rates/amounts in the stored diffs only for viewers who may see them.
  const showRates = canViewRates(currentUser);
  return new Response(buildCsv(rows.map((row) => auditRowForViewer(row, showRates))), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
    },
  });
}
