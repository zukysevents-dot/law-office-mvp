import { HrAbsenceStatus, HrAbsenceType, ModuleKey } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import { csvResponse } from "@/lib/export/csv";
import { buildPayrollCsv, type PayrollRow } from "@/lib/hr/payroll-export";
import { assertCanManageHr } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
  assertCanManageHr(currentUser);
  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    return new Response("Chybí organizace.", { status: 400 });
  }

  const params = new URL(request.url).searchParams;
  const fromStr = params.get("from") ?? "";
  const toStr = params.get("to") ?? "";
  if (!DATE_RE.test(fromStr) || !DATE_RE.test(toStr)) {
    return new Response("Neplatné období.", { status: 400 });
  }
  const from = new Date(`${fromStr}T00:00:00.000Z`);
  const to = new Date(`${toStr}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return new Response("Neplatné období.", { status: 400 });
  }

  const prisma = getPrisma();
  const [employees, attendance, absences] = await Promise.all([
    prisma.hrEmployee.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, personalNumber: true },
    }),
    prisma.hrAttendanceRecord.findMany({
      where: { organizationId, workDate: { gte: from, lte: to } },
      select: { employeeId: true, workedHours: true },
    }),
    prisma.hrAbsenceRequest.findMany({
      where: {
        organizationId,
        status: HrAbsenceStatus.APPROVED,
        startDate: { gte: from, lte: to },
      },
      select: { employeeId: true, type: true, requestedHours: true },
    }),
  ]);

  const worked = new Map<string, number>();
  for (const record of attendance) {
    worked.set(
      record.employeeId,
      (worked.get(record.employeeId) ?? 0) + Number(record.workedHours),
    );
  }

  const vacation = new Map<string, number>();
  const sick = new Map<string, number>();
  const other = new Map<string, number>();
  for (const absence of absences) {
    const target =
      absence.type === HrAbsenceType.VACATION
        ? vacation
        : absence.type === HrAbsenceType.SICK
          ? sick
          : other;
    target.set(
      absence.employeeId,
      (target.get(absence.employeeId) ?? 0) + Number(absence.requestedHours),
    );
  }

  const rows: PayrollRow[] = employees.map((employee) => ({
    personalNumber: employee.personalNumber,
    name: `${employee.lastName} ${employee.firstName}`,
    workedHours: worked.get(employee.id) ?? 0,
    vacationHours: vacation.get(employee.id) ?? 0,
    sickHours: sick.get(employee.id) ?? 0,
    otherAbsenceHours: other.get(employee.id) ?? 0,
  }));

  await writeAuditLog({
    entityType: "HrPayrollExport",
    entityId: organizationId,
    action: "EXPORT_PAYROLL",
    changedById: currentUser.id,
  });

  // Prepend a UTF-8 BOM so Excel opens the Czech characters correctly.
  const body = `﻿${buildPayrollCsv(rows)}`;
  return csvResponse(`mzdy_${fromStr}_${toStr}.csv`, body);
}
