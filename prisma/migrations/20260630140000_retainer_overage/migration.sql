-- Měsíční vyúčtování paušálu (RetainerInvoicePeriod) — tvrdá idempotence
-- paušálu přes unique [retainerId, periodYear, periodMonth] + agregát krytých/
-- přesahových hodin. Žádné nové WorkLog sloupce — kryté i přesahové work-logy
-- se zamykají existujícím invoicedAt/invoicedInvoiceId lockem.

-- CreateTable
CREATE TABLE "retainerInvoicePeriods" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "retainerId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "coveredHours" DECIMAL(8,2) NOT NULL,
    "overageHours" DECIMAL(8,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retainerInvoicePeriods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retainerInvoicePeriods_invoiceId_key" ON "retainerInvoicePeriods"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "retainerInvoicePeriods_retainerId_periodYear_periodMonth_key" ON "retainerInvoicePeriods"("retainerId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "retainerInvoicePeriods_organizationId_idx" ON "retainerInvoicePeriods"("organizationId");

-- AddForeignKey
ALTER TABLE "retainerInvoicePeriods" ADD CONSTRAINT "retainerInvoicePeriods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retainerInvoicePeriods" ADD CONSTRAINT "retainerInvoicePeriods_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "retainerAgreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retainerInvoicePeriods" ADD CONSTRAINT "retainerInvoicePeriods_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
