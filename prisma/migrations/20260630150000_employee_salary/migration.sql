-- Mzda/odměna zaměstnance (revize ř.114) — admin zadává výši a způsob zdanění.
-- Citlivý mzdový údaj, čtený/editovaný jen ADMIN/PARTNER (canManageHr).

-- CreateEnum
CREATE TYPE "SalaryTaxMode" AS ENUM ('EMPLOYMENT', 'DPP', 'DPC', 'CONTRACTOR', 'OTHER');

-- AlterTable
ALTER TABLE "hrEmployees" ADD COLUMN "grossSalaryCzk" DECIMAL(12,2);
ALTER TABLE "hrEmployees" ADD COLUMN "salaryTaxMode" "SalaryTaxMode";
ALTER TABLE "hrEmployees" ADD COLUMN "salaryNote" TEXT;
