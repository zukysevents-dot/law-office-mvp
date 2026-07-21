-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "dic" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "ico" TEXT,
ADD COLUMN     "invoiceDueDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "vatPayer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vatRate" INTEGER NOT NULL DEFAULT 21;

-- AlterTable
ALTER TABLE "workLogs" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxableSupplyAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "subtotalCzk" DECIMAL(14,2) NOT NULL,
    "vatCzk" DECIMAL(14,2) NOT NULL,
    "totalCzk" DECIMAL(14,2) NOT NULL,
    "vatRate" INTEGER NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoiceLineItems" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "workLogId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amountCzk" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "invoiceLineItems_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_organizationId_idx" ON "invoices"("organizationId");

-- CreateIndex
CREATE INDEX "invoices_subjectId_idx" ON "invoices"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organizationId_invoiceNumber_key" ON "invoices"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "invoiceLineItems_invoiceId_idx" ON "invoiceLineItems"("invoiceId");

-- CreateIndex
CREATE INDEX "workLogs_invoiceId_idx" ON "workLogs"("invoiceId");

-- AddForeignKey
ALTER TABLE "workLogs" ADD CONSTRAINT "workLogs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoiceLineItems" ADD CONSTRAINT "invoiceLineItems_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoiceLineItems" ADD CONSTRAINT "invoiceLineItems_workLogId_fkey" FOREIGN KEY ("workLogId") REFERENCES "workLogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
