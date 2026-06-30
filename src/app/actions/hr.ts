"use server";

import { revalidatePath } from "next/cache";

import type { Prisma } from "@/generated/prisma/client";
import {
  HrAbsenceStatus,
  HrAbsenceType,
  HrAttendanceSource,
  HrEmploymentType,
  ModuleKey,
} from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  checkboxValue,
  enumValue,
  optionalDate,
  optionalNumber,
  optionalString,
  requiredDate,
  requiredNumber,
  requiredString,
} from "@/lib/form";
import { computeAbsenceHours } from "@/lib/hr/absence-calc";
import { computeWorkedHours } from "@/lib/hr/attendance-calc";
import {
  assertNoOverdraw,
  computeRemainingHours,
} from "@/lib/hr/leave-balance";
import { parseAttendanceCsv } from "@/lib/hr/import";
import {
  andWhere,
  assertCanManageHr,
  canManageHr,
  hrAbsenceVisibilityWhere,
  hrEmployeeVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { parseSalaryTaxMode, validateGrossSalary } from "@/lib/salary";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

const MAX_TEXT = 2000;
const MAX_NAME = 200;

async function authorize(): Promise<{
  currentUser: CurrentUser;
  organizationId: string;
}> {
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
  const organizationId = currentUser.organizationId;
  if (!organizationId) {
    throw new Error("Chybí organizace.");
  }
  return { currentUser, organizationId };
}

function clampText(value: string | null, max: number): string | null {
  if (value && value.length > max) {
    throw new Error("Text je příliš dlouhý.");
  }
  return value;
}

// Validate an optional User link: must be an ACTIVE member of the same org and
// not already linked to another employee.
async function validateEmployeeUser(
  organizationId: string,
  userId: string | null,
  selfEmployeeId: string | null,
): Promise<string | null> {
  if (!userId) {
    return null;
  }
  const member = await getPrisma().organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE" },
    select: { userId: true },
  });
  if (!member) {
    throw new Error("Uživatel není členem této kanceláře.");
  }
  const existing = await getPrisma().hrEmployee.findFirst({
    where: { userId, NOT: selfEmployeeId ? { id: selfEmployeeId } : undefined },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Tento uživatel už je propojen s jiným zaměstnancem.");
  }
  return userId;
}

// --- Employees (HR-3) --------------------------------------------------------

// Mzdové údaje z formuláře (revize ř.114) — citlivé, jen ADMIN/PARTNER.
// Prázdná pole → null. grossSalaryCzk = hrubá měsíční mzda/odměna.
function parseSalaryFields(formData: FormData) {
  const grossSalaryCzk = validateGrossSalary(
    optionalNumber(formData, "grossSalaryCzk"),
  );
  const salaryTaxMode = parseSalaryTaxMode(
    optionalString(formData, "salaryTaxMode"),
  );
  const salaryNote = clampText(optionalString(formData, "salaryNote"), 500);
  return { grossSalaryCzk, salaryTaxMode, salaryNote };
}

export async function createEmployee(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageHr(currentUser);

  const firstName = clampText(requiredString(formData, "firstName"), MAX_NAME)!;
  const lastName = clampText(requiredString(formData, "lastName"), MAX_NAME)!;
  const personalNumber = clampText(optionalString(formData, "personalNumber"), MAX_NAME);
  const position = clampText(optionalString(formData, "position"), MAX_NAME);
  const employmentType = enumValue(
    HrEmploymentType,
    formData.get("employmentType"),
    HrEmploymentType.FULL_TIME,
  );
  const weeklyHours = requiredNumber(formData, "weeklyHours");
  const dailyHours = requiredNumber(formData, "dailyHours");
  if (weeklyHours < 0 || weeklyHours > 168 || dailyHours < 0 || dailyHours > 24) {
    throw new Error("Neplatný fond pracovní doby.");
  }
  const startDate = optionalDate(formData, "startDate");
  const { grossSalaryCzk, salaryTaxMode, salaryNote } =
    parseSalaryFields(formData);
  const userId = await validateEmployeeUser(
    organizationId,
    optionalString(formData, "userId"),
    null,
  );

  const employee = await prisma.hrEmployee.create({
    data: {
      organizationId,
      firstName,
      lastName,
      personalNumber,
      position,
      employmentType,
      weeklyHours,
      dailyHours,
      grossSalaryCzk,
      salaryTaxMode,
      salaryNote,
      startDate,
      userId,
      createdById: currentUser.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "HrEmployee",
      entityId: employee.id,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: auditJson({ firstName, lastName, employmentType }),
    },
  });

  revalidatePath("/hr/employees");
}

export async function updateEmployee(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageHr(currentUser);

  const employeeId = requiredString(formData, "employeeId");
  const existing = await prisma.hrEmployee.findFirst({
    where: { id: employeeId, organizationId },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("Zaměstnanec nenalezen.");
  }

  const firstName = clampText(requiredString(formData, "firstName"), MAX_NAME)!;
  const lastName = clampText(requiredString(formData, "lastName"), MAX_NAME)!;
  const position = clampText(optionalString(formData, "position"), MAX_NAME);
  const employmentType = enumValue(
    HrEmploymentType,
    formData.get("employmentType"),
    HrEmploymentType.FULL_TIME,
  );
  const weeklyHours = requiredNumber(formData, "weeklyHours");
  const dailyHours = requiredNumber(formData, "dailyHours");
  if (weeklyHours < 0 || weeklyHours > 168 || dailyHours < 0 || dailyHours > 24) {
    throw new Error("Neplatný fond pracovní doby.");
  }
  const { grossSalaryCzk, salaryTaxMode, salaryNote } =
    parseSalaryFields(formData);
  const userId = await validateEmployeeUser(
    organizationId,
    optionalString(formData, "userId"),
    employeeId,
  );

  await prisma.$transaction(async (tx) => {
    await tx.hrEmployee.update({
      where: { id: employeeId },
      data: {
        firstName,
        lastName,
        position,
        employmentType,
        weeklyHours,
        dailyHours,
        grossSalaryCzk,
        salaryTaxMode,
        salaryNote,
        userId,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "HrEmployee",
        entityId: employeeId,
        action: "UPDATE",
        changedById: currentUser.id,
        newValue: auditJson({ firstName, lastName, employmentType }),
      },
    });
  });

  revalidatePath("/hr/employees");
}

export async function archiveEmployee(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageHr(currentUser);

  const employeeId = requiredString(formData, "employeeId");
  const existing = await prisma.hrEmployee.findFirst({
    where: { id: employeeId, organizationId },
    select: { id: true, archivedAt: true },
  });
  if (!existing) {
    throw new Error("Zaměstnanec nenalezen.");
  }
  const archive = !existing.archivedAt;

  await prisma.$transaction(async (tx) => {
    await tx.hrEmployee.update({
      where: { id: employeeId },
      data: { archivedAt: archive ? new Date() : null, active: !archive },
    });
    await tx.auditLog.create({
      data: {
        entityType: "HrEmployee",
        entityId: employeeId,
        action: archive ? "ARCHIVE" : "RESTORE",
        changedById: currentUser.id,
      },
    });
  });

  revalidatePath("/hr/employees");
}

// Set/adjust the yearly leave entitlement (manager only).
export async function setLeaveBalance(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageHr(currentUser);

  const employeeId = requiredString(formData, "employeeId");
  const year = requiredNumber(formData, "year");
  const entitlementHours = requiredNumber(formData, "entitlementHours");
  const carryoverHours = optionalNumber(formData, "carryoverHours") ?? 0;
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    entitlementHours < 0 ||
    carryoverHours < 0
  ) {
    throw new Error("Neplatné hodnoty salda.");
  }

  const employee = await prisma.hrEmployee.findFirst({
    where: { id: employeeId, organizationId, archivedAt: null },
    select: { id: true },
  });
  if (!employee) {
    throw new Error("Zaměstnanec nenalezen.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.hrLeaveBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      update: { entitlementHours, carryoverHours },
      create: { organizationId, employeeId, year, entitlementHours, carryoverHours },
    });
    await tx.auditLog.create({
      data: {
        entityType: "HrLeaveBalance",
        entityId: employeeId,
        action: "SET_BALANCE",
        changedById: currentUser.id,
        newValue: auditJson({ year, entitlementHours, carryoverHours }),
      },
    });
  });

  revalidatePath("/hr/employees");
  revalidatePath("/hr/absences");
}

// --- Attendance (HR-4) -------------------------------------------------------

export async function recordAttendance(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageHr(currentUser);

  const employeeId = requiredString(formData, "employeeId");
  const employee = await prisma.hrEmployee.findFirst({
    where: { id: employeeId, organizationId, archivedAt: null },
    select: { id: true },
  });
  if (!employee) {
    throw new Error("Zaměstnanec nenalezen.");
  }

  const workDate = requiredDate(formData, "workDate");
  const breakHours = optionalNumber(formData, "breakHours") ?? 0;
  const checkIn = optionalDate(formData, "checkIn");
  const checkOut = optionalDate(formData, "checkOut");
  let workedHours = optionalNumber(formData, "workedHours") ?? 0;
  if (checkIn && checkOut) {
    workedHours = computeWorkedHours(checkIn, checkOut, breakHours);
  }
  if (workedHours < 0 || workedHours > 24 || breakHours < 0) {
    throw new Error("Neplatné hodnoty docházky.");
  }
  const note = clampText(optionalString(formData, "note"), MAX_TEXT);

  await prisma.$transaction(async (tx) => {
    await tx.hrAttendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId, workDate } },
      update: { checkIn, checkOut, workedHours, breakHours, note, source: HrAttendanceSource.MANUAL },
      create: {
        organizationId,
        employeeId,
        workDate,
        checkIn,
        checkOut,
        workedHours,
        breakHours,
        note,
        source: HrAttendanceSource.MANUAL,
        createdById: currentUser.id,
      },
    });
    await tx.auditLog.create({
      data: {
        entityType: "HrAttendanceRecord",
        entityId: employeeId,
        action: "RECORD_ATTENDANCE",
        changedById: currentUser.id,
        newValue: auditJson({ workDate: workDate.toISOString(), workedHours }),
      },
    });
  });

  revalidatePath("/hr/attendance");
}

// Bulk import attendance from CSV (manual file, no hardware). One batch = one
// transaction; a parse error writes nothing.
export async function importAttendance(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageHr(currentUser);

  const csv = requiredString(formData, "csv");
  const rows = parseAttendanceCsv(csv); // throws on malformed input
  if (rows.length === 0) {
    throw new Error("Soubor neobsahuje žádné řádky.");
  }
  if (rows.length > 5000) {
    throw new Error("Příliš mnoho řádků v jednom importu.");
  }

  // Resolve employees by personalNumber within the org.
  const personalNumbers = [...new Set(rows.map((r) => r.personalNumber))];
  const employees = await prisma.hrEmployee.findMany({
    where: { organizationId, personalNumber: { in: personalNumbers } },
    select: { id: true, personalNumber: true },
  });
  const byNumber = new Map(employees.map((e) => [e.personalNumber, e.id]));

  const importBatchId = `imp_${currentUser.id}_${rows.length}`;
  let imported = 0;
  const skipped: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const employeeId = byNumber.get(row.personalNumber);
      if (!employeeId) {
        skipped.push(row.personalNumber);
        continue;
      }
      const workedHours =
        row.checkIn && row.checkOut
          ? computeWorkedHours(row.checkIn, row.checkOut, row.breakHours)
          : row.workedHours;
      await tx.hrAttendanceRecord.upsert({
        where: { employeeId_workDate: { employeeId, workDate: row.workDate } },
        update: {
          checkIn: row.checkIn,
          checkOut: row.checkOut,
          workedHours,
          breakHours: row.breakHours,
          source: HrAttendanceSource.IMPORT,
          importBatchId,
        },
        create: {
          organizationId,
          employeeId,
          workDate: row.workDate,
          checkIn: row.checkIn,
          checkOut: row.checkOut,
          workedHours,
          breakHours: row.breakHours,
          source: HrAttendanceSource.IMPORT,
          importBatchId,
          createdById: currentUser.id,
        },
      });
      imported += 1;
    }
    await tx.auditLog.create({
      data: {
        entityType: "HrAttendanceRecord",
        entityId: importBatchId,
        action: "IMPORT_ATTENDANCE",
        changedById: currentUser.id,
        newValue: auditJson({ imported, skipped }),
      },
    });
  });

  revalidatePath("/hr/attendance");
}

// --- Absences + leave balance (HR-5 / HR-6) ----------------------------------

// Resolve the target employee, enforcing: managers may act for anyone; a regular
// user may only request for their OWN linked employee record.
async function resolveRequestableEmployee(
  currentUser: CurrentUser,
  organizationId: string,
  employeeId: string,
): Promise<{ id: string; dailyHours: number }> {
  const employee = await getPrisma().hrEmployee.findFirst({
    where: andWhere(
      { id: employeeId, organizationId, archivedAt: null },
      hrEmployeeVisibilityWhere(currentUser),
    ),
    select: { id: true, dailyHours: true },
  });
  if (!employee) {
    throw new Error("Zaměstnanec nenalezen.");
  }
  return { id: employee.id, dailyHours: Number(employee.dailyHours) };
}

export async function requestAbsence(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const employeeId = requiredString(formData, "employeeId");
  const employee = await resolveRequestableEmployee(
    currentUser,
    organizationId,
    employeeId,
  );

  const type = enumValue(HrAbsenceType, formData.get("type"), HrAbsenceType.VACATION);
  const startDate = requiredDate(formData, "startDate");
  const endDate = requiredDate(formData, "endDate");
  if (endDate < startDate) {
    throw new Error("Konec absence musí být po jejím začátku.");
  }
  // Vacation debits a single year's balance (leaveYear = start year), so a
  // cross-year vacation would mis-account. Require it be split per year.
  if (
    type === HrAbsenceType.VACATION &&
    startDate.getUTCFullYear() !== endDate.getUTCFullYear()
  ) {
    throw new Error(
      "Žádost o dovolenou nesmí přesahovat přes přelom roku — rozdělte ji.",
    );
  }
  const halfDay = checkboxValue(formData, "halfDay");
  const note = clampText(optionalString(formData, "note"), MAX_TEXT);
  const requestedHours = computeAbsenceHours({
    startDate,
    endDate,
    halfDay,
    dailyHours: employee.dailyHours,
  });
  const leaveYear = startDate.getUTCFullYear();

  const created = await prisma.hrAbsenceRequest.create({
    data: {
      organizationId,
      employeeId: employee.id,
      type,
      status: HrAbsenceStatus.PENDING,
      startDate,
      endDate,
      halfDay,
      requestedHours,
      leaveYear,
      note,
      requestedById: currentUser.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "HrAbsenceRequest",
      entityId: created.id,
      action: "REQUEST_ABSENCE",
      changedById: currentUser.id,
      newValue: auditJson({ type, requestedHours, leaveYear }),
    },
  });

  revalidatePath("/hr/absences");
}

// Debit/credit the (employeeId, year) leave balance under a row lock. delta > 0
// debits (checks overdraw), delta < 0 credits back. Runs inside a transaction.
async function adjustLeaveBalance(
  tx: Prisma.TransactionClient,
  organizationId: string,
  employeeId: string,
  year: number,
  deltaHours: number,
): Promise<void> {
  await tx.hrLeaveBalance.upsert({
    where: { employeeId_year: { employeeId, year } },
    update: {},
    create: { organizationId, employeeId, year },
  });
  // Lock the row so concurrent approvals can't both read the same usedHours.
  await tx.$queryRaw`SELECT id FROM "hrLeaveBalances" WHERE "employeeId" = ${employeeId} AND "year" = ${year} FOR UPDATE`;
  const balance = await tx.hrLeaveBalance.findUnique({
    where: { employeeId_year: { employeeId, year } },
  });
  if (!balance) {
    throw new Error("Saldo dovolené nenalezeno.");
  }
  if (deltaHours > 0) {
    const remaining = computeRemainingHours(
      Number(balance.entitlementHours),
      Number(balance.carryoverHours),
      Number(balance.usedHours),
    );
    assertNoOverdraw(remaining, deltaHours);
  }
  // Never let a credit push usedHours below zero (DB CHECK also guards).
  const nextUsed = Math.max(0, Number(balance.usedHours) + deltaHours);
  await tx.hrLeaveBalance.update({
    where: { employeeId_year: { employeeId, year } },
    data: { usedHours: nextUsed },
  });
}

export async function approveAbsence(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageHr(currentUser);

  const requestId = requiredString(formData, "requestId");
  const request = await prisma.hrAbsenceRequest.findFirst({
    where: { id: requestId, organizationId },
    select: {
      id: true,
      status: true,
      type: true,
      employeeId: true,
      requestedHours: true,
      leaveYear: true,
    },
  });
  if (!request) {
    throw new Error("Žádost nenalezena.");
  }
  if (request.status !== HrAbsenceStatus.PENDING) {
    revalidatePath("/hr/absences");
    return; // idempotent: only PENDING transitions to APPROVED
  }

  await prisma.$transaction(async (tx) => {
    // Atomic PENDING→APPROVED: the conditional update is the authority (the outer
    // status check is only a fast path). If a concurrent approve already won,
    // count is 0 and we debit nothing — no double-spend of the balance.
    const transitioned = await tx.hrAbsenceRequest.updateMany({
      where: {
        id: requestId,
        organizationId,
        status: HrAbsenceStatus.PENDING,
      },
      data: {
        status: HrAbsenceStatus.APPROVED,
        decidedById: currentUser.id,
        decidedAt: new Date(),
      },
    });
    if (transitioned.count === 0) {
      return;
    }
    // request.* fields (type/requestedHours/leaveYear) are immutable after
    // creation, so the outer snapshot is safe to use for the debit.
    if (request.type === HrAbsenceType.VACATION && request.leaveYear !== null) {
      await adjustLeaveBalance(
        tx,
        organizationId,
        request.employeeId,
        request.leaveYear,
        Number(request.requestedHours), // may throw on overdraw → rolls back
      );
    }
    await tx.auditLog.create({
      data: {
        entityType: "HrAbsenceRequest",
        entityId: requestId,
        action: "APPROVE_ABSENCE",
        changedById: currentUser.id,
      },
    });
  });

  revalidatePath("/hr/absences");
}

export async function rejectAbsence(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();
  assertCanManageHr(currentUser);

  const requestId = requiredString(formData, "requestId");
  const request = await prisma.hrAbsenceRequest.findFirst({
    where: { id: requestId, organizationId },
    select: { id: true, status: true },
  });
  if (!request) {
    throw new Error("Žádost nenalezena.");
  }
  if (request.status !== HrAbsenceStatus.PENDING) {
    revalidatePath("/hr/absences");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const transitioned = await tx.hrAbsenceRequest.updateMany({
      where: {
        id: requestId,
        organizationId,
        status: HrAbsenceStatus.PENDING,
      },
      data: {
        status: HrAbsenceStatus.REJECTED,
        decidedById: currentUser.id,
        decidedAt: new Date(),
      },
    });
    if (transitioned.count === 0) {
      return;
    }
    await tx.auditLog.create({
      data: {
        entityType: "HrAbsenceRequest",
        entityId: requestId,
        action: "REJECT_ABSENCE",
        changedById: currentUser.id,
      },
    });
  });

  revalidatePath("/hr/absences");
}

// Cancel a request. A regular user may cancel their own PENDING request; a
// manager may cancel any. Cancelling an APPROVED vacation credits the balance back.
export async function cancelAbsence(formData: FormData) {
  const prisma = getPrisma();
  const { currentUser, organizationId } = await authorize();

  const requestId = requiredString(formData, "requestId");
  const request = await prisma.hrAbsenceRequest.findFirst({
    where: andWhere(
      { id: requestId, organizationId },
      hrAbsenceVisibilityWhere(currentUser),
    ),
    select: {
      id: true,
      status: true,
      type: true,
      employeeId: true,
      requestedHours: true,
      leaveYear: true,
    },
  });
  if (!request) {
    throw new Error("Žádost nenalezena.");
  }
  if (
    request.status === HrAbsenceStatus.CANCELLED ||
    request.status === HrAbsenceStatus.REJECTED
  ) {
    revalidatePath("/hr/absences");
    return;
  }
  // A non-manager may only cancel a still-PENDING request (fast-path check;
  // re-verified against the fresh status inside the transaction below).
  if (request.status === HrAbsenceStatus.APPROVED && !canManageHr(currentUser)) {
    throw new Error("Schválenou absenci může zrušit jen HR správce.");
  }

  const isManager = canManageHr(currentUser);

  await prisma.$transaction(async (tx) => {
    // Lock the request row and re-read its status inside the tx so a concurrent
    // approve/cancel can't cause a double (or missed) credit-back.
    await tx.$queryRaw`SELECT id FROM "hrAbsenceRequests" WHERE id = ${requestId} FOR UPDATE`;
    const fresh = await tx.hrAbsenceRequest.findFirst({
      where: { id: requestId, organizationId },
      select: {
        status: true,
        type: true,
        employeeId: true,
        requestedHours: true,
        leaveYear: true,
      },
    });
    if (
      !fresh ||
      fresh.status === HrAbsenceStatus.CANCELLED ||
      fresh.status === HrAbsenceStatus.REJECTED
    ) {
      return; // already terminal — idempotent no-op
    }
    // Re-enforce the permission against the fresh status (it may have flipped to
    // APPROVED after our outer read).
    if (fresh.status === HrAbsenceStatus.APPROVED && !isManager) {
      throw new Error("Schválenou absenci může zrušit jen HR správce.");
    }
    const creditBack =
      fresh.status === HrAbsenceStatus.APPROVED &&
      fresh.type === HrAbsenceType.VACATION &&
      fresh.leaveYear !== null;

    await tx.hrAbsenceRequest.update({
      where: { id: requestId },
      data: {
        status: HrAbsenceStatus.CANCELLED,
        decidedById: currentUser.id,
        decidedAt: new Date(),
      },
    });
    if (creditBack) {
      await adjustLeaveBalance(
        tx,
        organizationId,
        fresh.employeeId,
        fresh.leaveYear!,
        -Number(fresh.requestedHours),
      );
    }
    await tx.auditLog.create({
      data: {
        entityType: "HrAbsenceRequest",
        entityId: requestId,
        action: "CANCEL_ABSENCE",
        changedById: currentUser.id,
      },
    });
  });

  revalidatePath("/hr/absences");
}
