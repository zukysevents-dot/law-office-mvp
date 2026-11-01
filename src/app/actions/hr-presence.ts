"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { HrAbsenceStatus } from "@/generated/prisma/enums";
import { auditJson, writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { optionalString, requiredString } from "@/lib/form";
import { DAY_MS } from "@/lib/hours-plan";
import {
  parsePresencePlanEntries,
  parseWeekStart,
  toDateKey,
  weekWorkdays,
} from "@/lib/hr/presence";
import { assertCanAccessModule } from "@/lib/module-access.server";
import {
  andWhere,
  assertCanEditHrPresencePlan,
  hrTeamDirectoryWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Uloží plán přítomnosti jednoho zaměstnance na pracovní dny jednoho týdne.
// Dny pokryté žádostí o absenci (schválenou nebo čekající) se přeskočí —
// nepřítomnost se zadává jen v HR → Absence a plánovač ji jen zobrazuje.
export async function savePresencePlan(formData: FormData) {
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.hr");
  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  const prisma = getPrisma();

  const employeeId = requiredString(formData, "employeeId");
  const employee = await prisma.hrEmployee.findFirst({
    where: andWhere({ id: employeeId }, hrTeamDirectoryWhere(currentUser)),
    select: { id: true, userId: true },
  });
  if (!employee) {
    throw new Error("Zaměstnanec nenalezen.");
  }
  assertCanEditHrPresencePlan(currentUser, employee);

  const weekStartMs = parseWeekStart(optionalString(formData, "week"), new Date());
  const weekStart = new Date(weekStartMs);
  const weekEnd = new Date(weekStartMs + 7 * DAY_MS);
  const days = weekWorkdays(weekStartMs);
  const dayKeys = days.map(toDateKey);
  const entries = parsePresencePlanEntries((key) => formData.get(key), dayKeys);

  const [absences, existingPlans] = await Promise.all([
    prisma.hrAbsenceRequest.findMany({
      where: {
        organizationId,
        employeeId: employee.id,
        status: { in: [HrAbsenceStatus.APPROVED, HrAbsenceStatus.PENDING] },
        startDate: { lt: weekEnd },
        endDate: { gte: weekStart },
      },
      select: { startDate: true, endDate: true },
    }),
    prisma.hrPresencePlan.findMany({
      where: {
        organizationId,
        employeeId: employee.id,
        date: { gte: weekStart, lt: weekEnd },
      },
      select: { id: true, date: true, status: true, note: true },
    }),
  ]);

  const coveredByAbsence = new Set(
    dayKeys.filter((key) => {
      const dayMs = Date.parse(`${key}T00:00:00.000Z`);
      return absences.some(
        (absence) =>
          Date.parse(`${toDateKey(absence.startDate)}T00:00:00.000Z`) <= dayMs &&
          dayMs <= Date.parse(`${toDateKey(absence.endDate)}T00:00:00.000Z`),
      );
    }),
  );
  const existingByDay = new Map(
    existingPlans.map((plan) => [toDateKey(plan.date), plan]),
  );

  const operations = [];
  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};
  for (const entry of entries) {
    if (coveredByAbsence.has(entry.date)) {
      continue;
    }
    const existing = existingByDay.get(entry.date);
    const date = new Date(`${entry.date}T00:00:00.000Z`);
    if (!entry.status) {
      if (existing) {
        operations.push(
          prisma.hrPresencePlan.delete({ where: { id: existing.id } }),
        );
        before[entry.date] = existing.status;
        after[entry.date] = null;
      }
      continue;
    }
    if (existing?.status === entry.status && existing.note === entry.note) {
      continue;
    }
    operations.push(
      prisma.hrPresencePlan.upsert({
        where: { employeeId_date: { employeeId: employee.id, date } },
        create: {
          organizationId,
          employeeId: employee.id,
          date,
          status: entry.status,
          note: entry.note,
          createdById: currentUser.id,
        },
        update: { status: entry.status, note: entry.note },
      }),
    );
    before[entry.date] = existing?.status ?? null;
    after[entry.date] = entry.note ? `${entry.status}: ${entry.note}` : entry.status;
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
    await writeAuditLog({
      organizationId,
      entityType: "HrPresencePlan",
      entityId: employee.id,
      action: "UPDATE",
      changedById: currentUser.id,
      oldValue: auditJson({ week: toDateKey(weekStart), days: before }),
      newValue: auditJson({ week: toDateKey(weekStart), days: after }),
    });
  }

  revalidatePath("/hr/planning");
  const params = new URLSearchParams({ week: toDateKey(weekStart), saved: "1" });
  if (employee.userId !== currentUser.id) {
    params.set("employee", employee.id);
  }
  redirect(`/hr/planning?${params.toString()}`);
}
