-- Sken dokladu u AML identifikace (revize ř.26). MVP: odkaz (https) do externího
-- úložiště + metadata, NE binární soubor v DB (citlivý OÚ, AML retence 10 let).

-- AlterTable
ALTER TABLE "amlIdentifications" ADD COLUMN "scanUrl" TEXT;
ALTER TABLE "amlIdentifications" ADD COLUMN "scanFileName" TEXT;
ALTER TABLE "amlIdentifications" ADD COLUMN "scanUploadedAt" TIMESTAMP(3);
ALTER TABLE "amlIdentifications" ADD COLUMN "scanNote" TEXT;
