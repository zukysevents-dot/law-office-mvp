-- CreateEnum
CREATE TYPE "DataMessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "DataMessageStatus" AS ENUM ('RECEIVED', 'ACCEPTED', 'READ', 'SENT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DataBoxAccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "dataBoxAccounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "credentialsEncrypted" TEXT NOT NULL,
    "status" "DataBoxAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "dataBoxAccounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataMessages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataBoxAccountId" TEXT,
    "direction" "DataMessageDirection" NOT NULL,
    "dmId" TEXT,
    "senderBoxId" TEXT,
    "recipientBoxId" TEXT,
    "messageSubject" TEXT NOT NULL,
    "status" "DataMessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "deliveredAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "caseId" TEXT,
    "subjectId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "dataMessages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataBoxAttachments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataMessageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "storageUrl" TEXT,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataBoxAttachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dataBoxAccounts_organizationId_idx" ON "dataBoxAccounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "dataBoxAccounts_organizationId_boxId_key" ON "dataBoxAccounts"("organizationId", "boxId");

-- CreateIndex
CREATE INDEX "dataMessages_organizationId_idx" ON "dataMessages"("organizationId");

-- CreateIndex
CREATE INDEX "dataMessages_organizationId_direction_status_idx" ON "dataMessages"("organizationId", "direction", "status");

-- CreateIndex
CREATE INDEX "dataMessages_caseId_idx" ON "dataMessages"("caseId");

-- CreateIndex
CREATE INDEX "dataMessages_subjectId_idx" ON "dataMessages"("subjectId");

-- CreateIndex
CREATE INDEX "dataMessages_deliveredAt_idx" ON "dataMessages"("deliveredAt");

-- CreateIndex
CREATE INDEX "dataMessages_archivedAt_idx" ON "dataMessages"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "dataMessages_organizationId_dmId_key" ON "dataMessages"("organizationId", "dmId");

-- CreateIndex
CREATE INDEX "dataBoxAttachments_organizationId_idx" ON "dataBoxAttachments"("organizationId");

-- CreateIndex
CREATE INDEX "dataBoxAttachments_dataMessageId_idx" ON "dataBoxAttachments"("dataMessageId");

-- AddForeignKey
ALTER TABLE "dataBoxAccounts" ADD CONSTRAINT "dataBoxAccounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataBoxAccounts" ADD CONSTRAINT "dataBoxAccounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataMessages" ADD CONSTRAINT "dataMessages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataMessages" ADD CONSTRAINT "dataMessages_dataBoxAccountId_fkey" FOREIGN KEY ("dataBoxAccountId") REFERENCES "dataBoxAccounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataMessages" ADD CONSTRAINT "dataMessages_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataMessages" ADD CONSTRAINT "dataMessages_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataMessages" ADD CONSTRAINT "dataMessages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataBoxAttachments" ADD CONSTRAINT "dataBoxAttachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataBoxAttachments" ADD CONSTRAINT "dataBoxAttachments_dataMessageId_fkey" FOREIGN KEY ("dataMessageId") REFERENCES "dataMessages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
