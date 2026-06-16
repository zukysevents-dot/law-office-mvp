-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PARTNER', 'LAWYER', 'TRAINEE', 'INTERN');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('COMPANY', 'PERSON', 'ENTREPRENEUR', 'OTHER');

-- CreateEnum
CREATE TYPE "SubjectRole" AS ENUM ('CLIENT', 'COUNTERPARTY', 'POTENTIAL_CLIENT', 'CONTACT_PERSON', 'WITNESS', 'REPRESENTATIVE', 'STATUTORY_BODY', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('CREATED', 'ACCEPTED', 'IN_PROGRESS', 'FOR_REVIEW', 'WAITING_FOR_CLIENT', 'WAITING_FOR_COUNTERPARTY', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'STANDARD', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('BILLABLE', 'NEEDS_APPROVAL', 'INTERNAL_NON_BILLABLE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'LAWYER',
    "microsoftId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "type" "SubjectType" NOT NULL DEFAULT 'COMPANY',
    "name" TEXT NOT NULL,
    "ico" TEXT,
    "dic" TEXT,
    "address" TEXT,
    "legalForm" TEXT,
    "statutoryBody" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "insolvencyStatus" TEXT,
    "riskFlag" BOOLEAN NOT NULL DEFAULT false,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjectRelations" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "role" "SubjectRole" NOT NULL,
    "projectId" TEXT,
    "caseId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjectRelations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflictChecks" (
    "id" TEXT NOT NULL,
    "searchedQuery" TEXT NOT NULL,
    "subjectId" TEXT,
    "resultStatus" TEXT NOT NULL,
    "checkedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflictChecks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mainSubjectId" TEXT NOT NULL,
    "responsibleUserId" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "sharepointUrl" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileNumber" TEXT,
    "responsibleUserId" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "sharepointUrl" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "caseId" TEXT,
    "createdById" TEXT,
    "assignedToId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'CREATED',
    "priority" "TaskPriority" NOT NULL DEFAULT 'STANDARD',
    "shortDescription" TEXT,
    "detailedDescription" TEXT,
    "sharepointUrl" TEXT,
    "startDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taskStatusHistory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "oldStatus" "TaskStatus" NOT NULL,
    "newStatus" "TaskStatus" NOT NULL,
    "changedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taskStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workLogs" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "projectId" TEXT,
    "caseId" TEXT,
    "taskId" TEXT,
    "userId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL,
    "description" TEXT NOT NULL,
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'BILLABLE',
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "legalArea" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditLogs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditLogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_microsoftId_key" ON "users"("microsoftId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_ico_key" ON "subjects"("ico");

-- CreateIndex
CREATE INDEX "subjects_name_idx" ON "subjects"("name");

-- CreateIndex
CREATE INDEX "subjects_ico_idx" ON "subjects"("ico");

-- CreateIndex
CREATE INDEX "subjects_riskFlag_idx" ON "subjects"("riskFlag");

-- CreateIndex
CREATE INDEX "subjectRelations_subjectId_idx" ON "subjectRelations"("subjectId");

-- CreateIndex
CREATE INDEX "subjectRelations_projectId_idx" ON "subjectRelations"("projectId");

-- CreateIndex
CREATE INDEX "subjectRelations_caseId_idx" ON "subjectRelations"("caseId");

-- CreateIndex
CREATE INDEX "subjectRelations_role_idx" ON "subjectRelations"("role");

-- CreateIndex
CREATE INDEX "conflictChecks_searchedQuery_idx" ON "conflictChecks"("searchedQuery");

-- CreateIndex
CREATE INDEX "conflictChecks_subjectId_idx" ON "conflictChecks"("subjectId");

-- CreateIndex
CREATE INDEX "conflictChecks_checkedById_idx" ON "conflictChecks"("checkedById");

-- CreateIndex
CREATE INDEX "projects_mainSubjectId_idx" ON "projects"("mainSubjectId");

-- CreateIndex
CREATE INDEX "projects_responsibleUserId_idx" ON "projects"("responsibleUserId");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "cases_projectId_idx" ON "cases"("projectId");

-- CreateIndex
CREATE INDEX "cases_responsibleUserId_idx" ON "cases"("responsibleUserId");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cases_projectId_fileNumber_key" ON "cases"("projectId", "fileNumber");

-- CreateIndex
CREATE INDEX "tasks_projectId_idx" ON "tasks"("projectId");

-- CreateIndex
CREATE INDEX "tasks_caseId_idx" ON "tasks"("caseId");

-- CreateIndex
CREATE INDEX "tasks_assignedToId_idx" ON "tasks"("assignedToId");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_deadline_idx" ON "tasks"("deadline");

-- CreateIndex
CREATE INDEX "taskStatusHistory_taskId_idx" ON "taskStatusHistory"("taskId");

-- CreateIndex
CREATE INDEX "taskStatusHistory_changedById_idx" ON "taskStatusHistory"("changedById");

-- CreateIndex
CREATE INDEX "workLogs_subjectId_idx" ON "workLogs"("subjectId");

-- CreateIndex
CREATE INDEX "workLogs_projectId_idx" ON "workLogs"("projectId");

-- CreateIndex
CREATE INDEX "workLogs_caseId_idx" ON "workLogs"("caseId");

-- CreateIndex
CREATE INDEX "workLogs_taskId_idx" ON "workLogs"("taskId");

-- CreateIndex
CREATE INDEX "workLogs_userId_idx" ON "workLogs"("userId");

-- CreateIndex
CREATE INDEX "workLogs_workDate_idx" ON "workLogs"("workDate");

-- CreateIndex
CREATE INDEX "auditLogs_entityType_entityId_idx" ON "auditLogs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "auditLogs_changedById_idx" ON "auditLogs"("changedById");

-- CreateIndex
CREATE INDEX "auditLogs_createdAt_idx" ON "auditLogs"("createdAt");

-- AddForeignKey
ALTER TABLE "subjectRelations" ADD CONSTRAINT "subjectRelations_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjectRelations" ADD CONSTRAINT "subjectRelations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjectRelations" ADD CONSTRAINT "subjectRelations_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjectRelations" ADD CONSTRAINT "subjectRelations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflictChecks" ADD CONSTRAINT "conflictChecks_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflictChecks" ADD CONSTRAINT "conflictChecks_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_mainSubjectId_fkey" FOREIGN KEY ("mainSubjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskStatusHistory" ADD CONSTRAINT "taskStatusHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskStatusHistory" ADD CONSTRAINT "taskStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workLogs" ADD CONSTRAINT "workLogs_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workLogs" ADD CONSTRAINT "workLogs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workLogs" ADD CONSTRAINT "workLogs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workLogs" ADD CONSTRAINT "workLogs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workLogs" ADD CONSTRAINT "workLogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditLogs" ADD CONSTRAINT "auditLogs_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
