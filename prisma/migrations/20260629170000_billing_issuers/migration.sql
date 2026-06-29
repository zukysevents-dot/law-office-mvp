-- Další fakturující subjekty kanceláře + volba subjektu na faktuře (issuerId).

-- CreateTable
CREATE TABLE "billingIssuers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "ico" TEXT,
    "dic" TEXT,
    "address" TEXT,
    "bankAccount" TEXT,
    "iban" TEXT,
    "vatPayer" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "billingIssuers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billingIssuers_organizationId_idx" ON "billingIssuers"("organizationId");

-- AddForeignKey
ALTER TABLE "billingIssuers" ADD CONSTRAINT "billingIssuers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "issuerId" TEXT;

-- CreateIndex
CREATE INDEX "invoices_issuerId_idx" ON "invoices"("issuerId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "billingIssuers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
