-- CreateEnum
CREATE TYPE "PortalAccessStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "PortalShareType" AS ENUM ('DOCUMENT', 'CASE');

-- CreateTable
CREATE TABLE "portalAccesses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "PortalAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "portalAccesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portalLoginTokens" (
    "id" TEXT NOT NULL,
    "portalAccessId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "requestedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portalLoginTokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portalSessions" (
    "id" TEXT NOT NULL,
    "portalAccessId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portalSessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portalShares" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "portalAccessId" TEXT NOT NULL,
    "shareType" "PortalShareType" NOT NULL,
    "documentId" TEXT,
    "caseId" TEXT,
    "sharedById" TEXT,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "portalShares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portalAccesses_subjectId_key" ON "portalAccesses"("subjectId");

-- CreateIndex
CREATE INDEX "portalAccesses_organizationId_idx" ON "portalAccesses"("organizationId");

-- CreateIndex
CREATE INDEX "portalAccesses_email_idx" ON "portalAccesses"("email");

-- CreateIndex
CREATE UNIQUE INDEX "portalAccesses_organizationId_email_key" ON "portalAccesses"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "portalLoginTokens_tokenHash_key" ON "portalLoginTokens"("tokenHash");

-- CreateIndex
CREATE INDEX "portalLoginTokens_portalAccessId_idx" ON "portalLoginTokens"("portalAccessId");

-- CreateIndex
CREATE INDEX "portalLoginTokens_expiresAt_idx" ON "portalLoginTokens"("expiresAt");

-- CreateIndex
CREATE INDEX "portalSessions_portalAccessId_idx" ON "portalSessions"("portalAccessId");

-- CreateIndex
CREATE INDEX "portalSessions_expiresAt_idx" ON "portalSessions"("expiresAt");

-- CreateIndex
CREATE INDEX "portalShares_organizationId_idx" ON "portalShares"("organizationId");

-- CreateIndex
CREATE INDEX "portalShares_portalAccessId_idx" ON "portalShares"("portalAccessId");

-- CreateIndex
CREATE INDEX "portalShares_documentId_idx" ON "portalShares"("documentId");

-- CreateIndex
CREATE INDEX "portalShares_caseId_idx" ON "portalShares"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "portalShares_portalAccessId_documentId_key" ON "portalShares"("portalAccessId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "portalShares_portalAccessId_caseId_key" ON "portalShares"("portalAccessId", "caseId");

-- AddForeignKey
ALTER TABLE "portalAccesses" ADD CONSTRAINT "portalAccesses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalAccesses" ADD CONSTRAINT "portalAccesses_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalAccesses" ADD CONSTRAINT "portalAccesses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalLoginTokens" ADD CONSTRAINT "portalLoginTokens_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "portalAccesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalLoginTokens" ADD CONSTRAINT "portalLoginTokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalSessions" ADD CONSTRAINT "portalSessions_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "portalAccesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalSessions" ADD CONSTRAINT "portalSessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalShares" ADD CONSTRAINT "portalShares_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalShares" ADD CONSTRAINT "portalShares_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "portalAccesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalShares" ADD CONSTRAINT "portalShares_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalShares" ADD CONSTRAINT "portalShares_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portalShares" ADD CONSTRAINT "portalShares_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A share targets exactly one of a document XOR a case.
ALTER TABLE "portalShares" ADD CONSTRAINT "portalShares_document_xor_case"
  CHECK (("documentId" IS NULL) <> ("caseId" IS NULL));
