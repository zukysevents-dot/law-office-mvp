-- CreateEnum
CREATE TYPE "HrEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'AGREEMENT', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "HrAttendanceSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "HrAbsenceType" AS ENUM ('VACATION', 'SICK', 'HOME_OFFICE', 'DOCTOR', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "HrAbsenceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "hrEmployees" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "personalNumber" TEXT,
    "position" TEXT,
    "employmentType" "HrEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "weeklyHours" DECIMAL(5,2) NOT NULL DEFAULT 40,
    "dailyHours" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "hrEmployees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hrWorkSchedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "weeklyHours" DECIMAL(5,2) NOT NULL,
    "dailyHours" DECIMAL(4,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hrWorkSchedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hrAttendanceRecords" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "workedHours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "breakHours" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "source" "HrAttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "importBatchId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hrAttendanceRecords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hrAbsenceRequests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "HrAbsenceType" NOT NULL,
    "status" "HrAbsenceStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "requestedHours" DECIMAL(7,2) NOT NULL,
    "leaveYear" INTEGER,
    "note" TEXT,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hrAbsenceRequests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hrLeaveBalances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitlementHours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "carryoverHours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "usedHours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hrLeaveBalances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hrEmployees_userId_key" ON "hrEmployees"("userId");

-- CreateIndex
CREATE INDEX "hrEmployees_organizationId_idx" ON "hrEmployees"("organizationId");

-- CreateIndex
CREATE INDEX "hrEmployees_userId_idx" ON "hrEmployees"("userId");

-- CreateIndex
CREATE INDEX "hrEmployees_active_idx" ON "hrEmployees"("active");

-- CreateIndex
CREATE UNIQUE INDEX "hrEmployees_organizationId_personalNumber_key" ON "hrEmployees"("organizationId", "personalNumber");

-- CreateIndex
CREATE INDEX "hrWorkSchedules_organizationId_idx" ON "hrWorkSchedules"("organizationId");

-- CreateIndex
CREATE INDEX "hrWorkSchedules_employeeId_idx" ON "hrWorkSchedules"("employeeId");

-- CreateIndex
CREATE INDEX "hrAttendanceRecords_organizationId_idx" ON "hrAttendanceRecords"("organizationId");

-- CreateIndex
CREATE INDEX "hrAttendanceRecords_employeeId_idx" ON "hrAttendanceRecords"("employeeId");

-- CreateIndex
CREATE INDEX "hrAttendanceRecords_workDate_idx" ON "hrAttendanceRecords"("workDate");

-- CreateIndex
CREATE UNIQUE INDEX "hrAttendanceRecords_employeeId_workDate_key" ON "hrAttendanceRecords"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "hrAbsenceRequests_organizationId_idx" ON "hrAbsenceRequests"("organizationId");

-- CreateIndex
CREATE INDEX "hrAbsenceRequests_employeeId_idx" ON "hrAbsenceRequests"("employeeId");

-- CreateIndex
CREATE INDEX "hrAbsenceRequests_status_idx" ON "hrAbsenceRequests"("status");

-- CreateIndex
CREATE INDEX "hrAbsenceRequests_startDate_idx" ON "hrAbsenceRequests"("startDate");

-- CreateIndex
CREATE INDEX "hrLeaveBalances_organizationId_idx" ON "hrLeaveBalances"("organizationId");

-- CreateIndex
CREATE INDEX "hrLeaveBalances_employeeId_idx" ON "hrLeaveBalances"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "hrLeaveBalances_employeeId_year_key" ON "hrLeaveBalances"("employeeId", "year");

-- AddForeignKey
ALTER TABLE "hrEmployees" ADD CONSTRAINT "hrEmployees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrEmployees" ADD CONSTRAINT "hrEmployees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrEmployees" ADD CONSTRAINT "hrEmployees_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrWorkSchedules" ADD CONSTRAINT "hrWorkSchedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrWorkSchedules" ADD CONSTRAINT "hrWorkSchedules_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hrEmployees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrAttendanceRecords" ADD CONSTRAINT "hrAttendanceRecords_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrAttendanceRecords" ADD CONSTRAINT "hrAttendanceRecords_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hrEmployees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrAbsenceRequests" ADD CONSTRAINT "hrAbsenceRequests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrAbsenceRequests" ADD CONSTRAINT "hrAbsenceRequests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hrEmployees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrAbsenceRequests" ADD CONSTRAINT "hrAbsenceRequests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrAbsenceRequests" ADD CONSTRAINT "hrAbsenceRequests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrLeaveBalances" ADD CONSTRAINT "hrLeaveBalances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrLeaveBalances" ADD CONSTRAINT "hrLeaveBalances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hrEmployees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity guards: valid absence interval + non-negative hour accumulators.
ALTER TABLE "hrAbsenceRequests" ADD CONSTRAINT "hrAbsenceRequests_dates_valid"
  CHECK ("endDate" >= "startDate" AND "requestedHours" >= 0);
ALTER TABLE "hrLeaveBalances" ADD CONSTRAINT "hrLeaveBalances_used_nonneg"
  CHECK ("usedHours" >= 0);
ALTER TABLE "hrAttendanceRecords" ADD CONSTRAINT "hrAttendanceRecords_hours_nonneg"
  CHECK ("workedHours" >= 0 AND "breakHours" >= 0);
