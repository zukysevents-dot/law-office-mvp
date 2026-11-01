-- CreateTable
CREATE TABLE "matterComments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "caseId" TEXT,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "matterComments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workFeedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "taskId" TEXT,
    "workLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "workFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matterComments_organizationId_idx" ON "matterComments"("organizationId");

-- CreateIndex
CREATE INDEX "matterComments_projectId_createdAt_idx" ON "matterComments"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "matterComments_caseId_createdAt_idx" ON "matterComments"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "matterComments_authorId_idx" ON "matterComments"("authorId");

-- CreateIndex
CREATE INDEX "workFeedback_organizationId_createdAt_idx" ON "workFeedback"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "workFeedback_authorId_idx" ON "workFeedback"("authorId");

-- CreateIndex
CREATE INDEX "workFeedback_recipientId_idx" ON "workFeedback"("recipientId");

-- CreateIndex
CREATE INDEX "workFeedback_taskId_idx" ON "workFeedback"("taskId");

-- CreateIndex
CREATE INDEX "workFeedback_workLogId_idx" ON "workFeedback"("workLogId");

-- AddForeignKey
ALTER TABLE "matterComments" ADD CONSTRAINT "matterComments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matterComments" ADD CONSTRAINT "matterComments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matterComments" ADD CONSTRAINT "matterComments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matterComments" ADD CONSTRAINT "matterComments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workFeedback" ADD CONSTRAINT "workFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workFeedback" ADD CONSTRAINT "workFeedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workFeedback" ADD CONSTRAINT "workFeedback_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workFeedback" ADD CONSTRAINT "workFeedback_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workFeedback" ADD CONSTRAINT "workFeedback_workLogId_fkey" FOREIGN KEY ("workLogId") REFERENCES "workLogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
