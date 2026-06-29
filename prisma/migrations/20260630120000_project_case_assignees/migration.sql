-- Doplňkoví řešitelé (assignees) na Project a Case — víc řešitelů vedle
-- jediného responsibleUser; přiřazení uděluje viditelnost (a LAWYER i editaci).

-- CreateTable
CREATE TABLE "projectAssignees" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "projectAssignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caseAssignees" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "caseAssignees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projectAssignees_projectId_userId_key" ON "projectAssignees"("projectId", "userId");

-- CreateIndex
CREATE INDEX "projectAssignees_organizationId_idx" ON "projectAssignees"("organizationId");

-- CreateIndex
CREATE INDEX "projectAssignees_projectId_idx" ON "projectAssignees"("projectId");

-- CreateIndex
CREATE INDEX "projectAssignees_userId_idx" ON "projectAssignees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "caseAssignees_caseId_userId_key" ON "caseAssignees"("caseId", "userId");

-- CreateIndex
CREATE INDEX "caseAssignees_organizationId_idx" ON "caseAssignees"("organizationId");

-- CreateIndex
CREATE INDEX "caseAssignees_caseId_idx" ON "caseAssignees"("caseId");

-- CreateIndex
CREATE INDEX "caseAssignees_userId_idx" ON "caseAssignees"("userId");

-- AddForeignKey
ALTER TABLE "projectAssignees" ADD CONSTRAINT "projectAssignees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projectAssignees" ADD CONSTRAINT "projectAssignees_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projectAssignees" ADD CONSTRAINT "projectAssignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projectAssignees" ADD CONSTRAINT "projectAssignees_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caseAssignees" ADD CONSTRAINT "caseAssignees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caseAssignees" ADD CONSTRAINT "caseAssignees_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caseAssignees" ADD CONSTRAINT "caseAssignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caseAssignees" ADD CONSTRAINT "caseAssignees_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
