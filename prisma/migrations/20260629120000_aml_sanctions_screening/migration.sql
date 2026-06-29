-- AML sanctions screening (F3+): a global mirror of the EU consolidated list
-- plus per-subject screenings and candidate matches. Screening only suggests
-- candidates; the lawyer decides (hasSanctions stays on AmlAssessment).

-- CreateTable
CREATE TABLE "sanctionsListEntries" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'EU_CONSOLIDATED',
    "sourceEntityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'PERSON',
    "primaryName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliasesNormalized" TEXT[],
    "countries" TEXT[],
    "programs" TEXT[],
    "listPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sanctionsListEntries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanctionsScreenings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "queryName" TEXT NOT NULL,
    "queryNormalized" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'EU_CONSOLIDATED',
    "listVersionAt" TIMESTAMP(3),
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewOutcome" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "runById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanctionsScreenings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanctionsScreeningMatches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "screeningId" TEXT NOT NULL,
    "listEntryId" TEXT,
    "matchedName" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanctionsScreeningMatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sanctionsListEntries_normalizedName_idx" ON "sanctionsListEntries"("normalizedName");
CREATE INDEX "sanctionsListEntries_source_idx" ON "sanctionsListEntries"("source");
CREATE UNIQUE INDEX "sanctionsListEntries_source_sourceEntityId_key" ON "sanctionsListEntries"("source", "sourceEntityId");
CREATE INDEX "sanctionsScreenings_organizationId_idx" ON "sanctionsScreenings"("organizationId");
CREATE INDEX "sanctionsScreenings_subjectId_idx" ON "sanctionsScreenings"("subjectId");
CREATE INDEX "sanctionsScreenings_status_idx" ON "sanctionsScreenings"("status");
CREATE INDEX "sanctionsScreeningMatches_organizationId_idx" ON "sanctionsScreeningMatches"("organizationId");
CREATE INDEX "sanctionsScreeningMatches_screeningId_idx" ON "sanctionsScreeningMatches"("screeningId");
CREATE INDEX "sanctionsScreeningMatches_decision_idx" ON "sanctionsScreeningMatches"("decision");

-- AddForeignKey
ALTER TABLE "sanctionsScreenings" ADD CONSTRAINT "sanctionsScreenings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sanctionsScreenings" ADD CONSTRAINT "sanctionsScreenings_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sanctionsScreenings" ADD CONSTRAINT "sanctionsScreenings_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sanctionsScreenings" ADD CONSTRAINT "sanctionsScreenings_runById_fkey" FOREIGN KEY ("runById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sanctionsScreeningMatches" ADD CONSTRAINT "sanctionsScreeningMatches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sanctionsScreeningMatches" ADD CONSTRAINT "sanctionsScreeningMatches_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "sanctionsScreenings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sanctionsScreeningMatches" ADD CONSTRAINT "sanctionsScreeningMatches_listEntryId_fkey" FOREIGN KEY ("listEntryId") REFERENCES "sanctionsListEntries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sanctionsScreeningMatches" ADD CONSTRAINT "sanctionsScreeningMatches_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
