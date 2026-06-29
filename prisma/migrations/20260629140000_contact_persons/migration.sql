-- Kontaktní osoby subjektu (klienta); volitelně navázané na projekt nebo případ.

-- CreateTable
CREATE TABLE "contactPersons" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "projectId" TEXT,
    "caseId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "contactPersons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contactPersons_organizationId_idx" ON "contactPersons"("organizationId");

-- CreateIndex
CREATE INDEX "contactPersons_subjectId_idx" ON "contactPersons"("subjectId");

-- CreateIndex
CREATE INDEX "contactPersons_projectId_idx" ON "contactPersons"("projectId");

-- CreateIndex
CREATE INDEX "contactPersons_caseId_idx" ON "contactPersons"("caseId");

-- AddForeignKey
ALTER TABLE "contactPersons" ADD CONSTRAINT "contactPersons_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactPersons" ADD CONSTRAINT "contactPersons_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactPersons" ADD CONSTRAINT "contactPersons_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactPersons" ADD CONSTRAINT "contactPersons_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactPersons" ADD CONSTRAINT "contactPersons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
