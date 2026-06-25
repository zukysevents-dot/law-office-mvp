-- CreateEnum
CREATE TYPE "DeadlineType" AS ENUM ('PROCEDURAL', 'COURT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "DeadlineStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DEADLINE_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'DEADLINE_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'COURT_HEARING_SOON';

-- AlterTable
ALTER TABLE "notificationPreferences" ADD COLUMN     "courtHearingSoonEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deadlineOverdueEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deadlineSoonEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deadlineWatchDaysBefore" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "deadlines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "DeadlineType" NOT NULL DEFAULT 'PROCEDURAL',
    "status" "DeadlineStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "originEvent" TEXT,
    "originDate" TIMESTAMP(3),
    "computedRule" TEXT,
    "responsibleUserId" TEXT,
    "sourceDataMessageId" TEXT,
    "note" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courtHearings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "court" TEXT NOT NULL,
    "hearingAt" TIMESTAMP(3) NOT NULL,
    "room" TEXT,
    "responsibleUserId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "courtHearings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deadlines_organizationId_idx" ON "deadlines"("organizationId");

-- CreateIndex
CREATE INDEX "deadlines_caseId_idx" ON "deadlines"("caseId");

-- CreateIndex
CREATE INDEX "deadlines_responsibleUserId_idx" ON "deadlines"("responsibleUserId");

-- CreateIndex
CREATE INDEX "deadlines_status_idx" ON "deadlines"("status");

-- CreateIndex
CREATE INDEX "deadlines_dueDate_idx" ON "deadlines"("dueDate");

-- CreateIndex
CREATE INDEX "deadlines_sourceDataMessageId_idx" ON "deadlines"("sourceDataMessageId");

-- CreateIndex
CREATE INDEX "courtHearings_organizationId_idx" ON "courtHearings"("organizationId");

-- CreateIndex
CREATE INDEX "courtHearings_caseId_idx" ON "courtHearings"("caseId");

-- CreateIndex
CREATE INDEX "courtHearings_responsibleUserId_idx" ON "courtHearings"("responsibleUserId");

-- CreateIndex
CREATE INDEX "courtHearings_hearingAt_idx" ON "courtHearings"("hearingAt");

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_sourceDataMessageId_fkey" FOREIGN KEY ("sourceDataMessageId") REFERENCES "dataMessages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courtHearings" ADD CONSTRAINT "courtHearings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courtHearings" ADD CONSTRAINT "courtHearings_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courtHearings" ADD CONSTRAINT "courtHearings_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courtHearings" ADD CONSTRAINT "courtHearings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
