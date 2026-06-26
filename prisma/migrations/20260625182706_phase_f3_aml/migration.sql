-- CreateEnum
CREATE TYPE "AmlRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "amlIdentifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumberEncrypted" TEXT NOT NULL,
    "documentNumberMasked" TEXT NOT NULL,
    "issueCountry" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "method" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amlIdentifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amlAssessments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "riskLevel" "AmlRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "isPep" BOOLEAN NOT NULL DEFAULT false,
    "hasSanctions" BOOLEAN NOT NULL DEFAULT false,
    "screeningResult" TEXT,
    "note" TEXT,
    "reviewDueAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amlAssessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "amlIdentifications_organizationId_idx" ON "amlIdentifications"("organizationId");

-- CreateIndex
CREATE INDEX "amlIdentifications_subjectId_idx" ON "amlIdentifications"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "amlAssessments_subjectId_key" ON "amlAssessments"("subjectId");

-- CreateIndex
CREATE INDEX "amlAssessments_organizationId_idx" ON "amlAssessments"("organizationId");

-- CreateIndex
CREATE INDEX "amlAssessments_riskLevel_idx" ON "amlAssessments"("riskLevel");

-- CreateIndex
CREATE INDEX "amlAssessments_reviewDueAt_idx" ON "amlAssessments"("reviewDueAt");

-- AddForeignKey
ALTER TABLE "amlIdentifications" ADD CONSTRAINT "amlIdentifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amlIdentifications" ADD CONSTRAINT "amlIdentifications_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amlIdentifications" ADD CONSTRAINT "amlIdentifications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amlAssessments" ADD CONSTRAINT "amlAssessments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amlAssessments" ADD CONSTRAINT "amlAssessments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amlAssessments" ADD CONSTRAINT "amlAssessments_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amlAssessments" ADD CONSTRAINT "amlAssessments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
