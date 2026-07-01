-- Hlídání rejstříků (ISIR/OR přes ARES). Nový enum + tabulka událostí změn +
-- per-subject watch pole + notifikační preference. Vše additivní/backward-compat.

-- CreateEnum
CREATE TYPE "RegistryChangeType" AS ENUM ('INSOLVENCY', 'DISSOLVED', 'LIQUIDATION', 'RISK_CLEARED', 'OTHER');

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN "registryWatchEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "subjects" ADD COLUMN "registryCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notificationPreferences" ADD COLUMN "registryChangeEmail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "registryChangeEvents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "changeType" "RegistryChangeType" NOT NULL,
    "summary" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registryChangeEvents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subjects_registryWatchEnabled_registryCheckedAt_idx" ON "subjects"("registryWatchEnabled", "registryCheckedAt");

-- CreateIndex
CREATE INDEX "registryChangeEvents_organizationId_idx" ON "registryChangeEvents"("organizationId");

-- CreateIndex
CREATE INDEX "registryChangeEvents_subjectId_idx" ON "registryChangeEvents"("subjectId");

-- CreateIndex
CREATE INDEX "registryChangeEvents_acknowledgedAt_idx" ON "registryChangeEvents"("acknowledgedAt");

-- AddForeignKey
ALTER TABLE "registryChangeEvents" ADD CONSTRAINT "registryChangeEvents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registryChangeEvents" ADD CONSTRAINT "registryChangeEvents_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registryChangeEvents" ADD CONSTRAINT "registryChangeEvents_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
