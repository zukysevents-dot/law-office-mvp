-- Interní kategorie úkonů (nabízí se místo právní oblasti u interních hodin)
-- a tři nové typy absencí: seminář ČAK, advokátní zkoušky, vzdělávání.

-- CreateEnum
CREATE TYPE "InternalTaskCategory" AS ENUM ('ADMINISTRATION', 'EDUCATION', 'ERRAND', 'ACQUISITION', 'REPORTING', 'OFFICE_MANAGEMENT');

-- AlterEnum
ALTER TYPE "HrAbsenceType" ADD VALUE IF NOT EXISTS 'SEMINAR_CAK';
ALTER TYPE "HrAbsenceType" ADD VALUE IF NOT EXISTS 'BAR_EXAM';
ALTER TYPE "HrAbsenceType" ADD VALUE IF NOT EXISTS 'EDUCATION';

-- AlterTable
ALTER TABLE "workLogs" ADD COLUMN "internalCategory" "InternalTaskCategory";
