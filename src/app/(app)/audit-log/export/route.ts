import type { NextRequest } from "next/server";

import {
  auditActionLabel,
  auditEntityTypeLabel,
  buildAuditWhere,
  readAuditFilters,
} from "@/lib/audit-filters";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { andWhere, canViewAllLegalData } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

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
        auditDetail(row.newValue ?? row.oldValue),
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

  if (!canViewAllLegalData(currentUser)) {
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
        changedBy: {
          is: { memberships: { some: { organizationId: currentUser.organizationId } } },
        },
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

  return new Response(buildCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
    },
  });
}
