-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('HOURLY', 'FLAT', 'MIXED', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskDeadlineType" AS ENUM ('INTERNAL', 'PROCEDURAL');

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'POSTPONED';
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'FILED';

-- AlterTable
ALTER TABLE "subjects"
  ADD COLUMN "legalServicesContractUrl" TEXT,
  ADD COLUMN "feeType" "FeeType",
  ADD COLUMN "hourlyRate" DECIMAL(12,2),
  ADD COLUMN "flatFee" DECIMAL(12,2),
  ADD COLUMN "feeNote" TEXT;

-- AlterTable
ALTER TABLE "projects"
  ADD COLUMN "hourlyRate" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "tasks"
  ADD COLUMN "responsibleUserId" TEXT,
  ADD COLUMN "deadlineType" "TaskDeadlineType" NOT NULL DEFAULT 'INTERNAL';

-- AlterTable
ALTER TABLE "workLogs"
  ADD COLUMN "hourlyRate" DECIMAL(12,2),
  ADD COLUMN "amountCzk" DECIMAL(12,2);

ALTER TABLE "workLogs" DROP CONSTRAINT "workLogs_subjectId_fkey";
ALTER TABLE "workLogs" ALTER COLUMN "subjectId" DROP NOT NULL;
ALTER TABLE "workLogs" ALTER COLUMN "description" DROP NOT NULL;
ALTER TABLE "workLogs" ADD CONSTRAINT "workLogs_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "taskComments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taskComments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "references" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "caseId" TEXT,
    "subjectId" TEXT,
    "legalArea" TEXT,
    "valueCzk" DECIMAL(14,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_responsibleUserId_idx" ON "tasks"("responsibleUserId");

-- CreateIndex
CREATE INDEX "tasks_deadlineType_idx" ON "tasks"("deadlineType");

-- CreateIndex
CREATE INDEX "taskComments_taskId_idx" ON "taskComments"("taskId");

-- CreateIndex
CREATE INDEX "taskComments_authorId_idx" ON "taskComments"("authorId");

-- CreateIndex
CREATE INDEX "taskComments_createdAt_idx" ON "taskComments"("createdAt");

-- CreateIndex
CREATE INDEX "references_projectId_idx" ON "references"("projectId");

-- CreateIndex
CREATE INDEX "references_caseId_idx" ON "references"("caseId");

-- CreateIndex
CREATE INDEX "references_subjectId_idx" ON "references"("subjectId");

-- CreateIndex
CREATE INDEX "references_legalArea_idx" ON "references"("legalArea");

-- CreateIndex
CREATE INDEX "references_valueCzk_idx" ON "references"("valueCzk");

-- CreateIndex
CREATE INDEX "references_endDate_idx" ON "references"("endDate");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskComments" ADD CONSTRAINT "taskComments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskComments" ADD CONSTRAINT "taskComments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
