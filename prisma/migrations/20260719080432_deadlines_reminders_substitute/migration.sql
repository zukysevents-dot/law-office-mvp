-- CreateEnum
CREATE TYPE "DeadlineCalendar" AS ENUM ('CALENDAR_DAYS', 'BUSINESS_DAYS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TASK_DEADLINE_ESCALATED';
ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_OVERDUE';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "lastReminderAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "deadlineAckedAt" TIMESTAMP(3),
ADD COLUMN     "deadlineAckedById" TEXT,
ADD COLUMN     "deadlineRuleId" TEXT,
ADD COLUMN     "triggerDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "substituteFrom" TIMESTAMP(3),
ADD COLUMN     "substituteUntil" TIMESTAMP(3),
ADD COLUMN     "substituteUserId" TEXT;

-- CreateTable
CREATE TABLE "deadlineRules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "calendar" "DeadlineCalendar" NOT NULL DEFAULT 'CALENDAR_DAYS',
    "rollForward" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deadlineRules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deadlineRules_organizationId_idx" ON "deadlineRules"("organizationId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "users_substituteUserId_idx" ON "users"("substituteUserId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_substituteUserId_fkey" FOREIGN KEY ("substituteUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deadlineAckedById_fkey" FOREIGN KEY ("deadlineAckedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlineRules" ADD CONSTRAINT "deadlineRules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
