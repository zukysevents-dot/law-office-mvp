-- Expand-only (balíček 02 – Subjekty): nový enum, nové NULLable sloupce na
-- "subjects" a dvě nové podřízené tabulky. Žádný DROP / RENAME / NOT NULL na
-- existujících sloupcích – kód nasazený před touto migrací funguje beze změny.
-- Data ze stávajících sloupců "email" / "statutoryBody" převádí až následující
-- migrace (nový enum se nesmí použít ve stejné migraci, ve které vzniká).

-- CreateEnum
CREATE TYPE "SubjectContactType" AS ENUM ('EMAIL', 'PHONE', 'DATA_BOX', 'WEB', 'OTHER');

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "birthNumber" TEXT,
ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "titleAfter" TEXT,
ADD COLUMN     "titleBefore" TEXT,
ADD COLUMN     "tradeName" TEXT;

-- CreateTable
CREATE TABLE "subjectContacts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "type" "SubjectContactType" NOT NULL,
    "value" TEXT NOT NULL,
    "valueNormalized" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjectContacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjectStatutoryBodies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "function" TEXT,
    "actingMethod" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "linkedSubjectId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjectStatutoryBodies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subjectContacts_organizationId_idx" ON "subjectContacts"("organizationId");

-- CreateIndex
CREATE INDEX "subjectContacts_subjectId_position_idx" ON "subjectContacts"("subjectId", "position");

-- CreateIndex
CREATE INDEX "subjectContacts_organizationId_valueNormalized_idx" ON "subjectContacts"("organizationId", "valueNormalized");

-- CreateIndex
CREATE INDEX "subjectStatutoryBodies_organizationId_idx" ON "subjectStatutoryBodies"("organizationId");

-- CreateIndex
CREATE INDEX "subjectStatutoryBodies_subjectId_position_idx" ON "subjectStatutoryBodies"("subjectId", "position");

-- CreateIndex
CREATE INDEX "subjectStatutoryBodies_linkedSubjectId_idx" ON "subjectStatutoryBodies"("linkedSubjectId");

-- CreateIndex
CREATE INDEX "subjects_organizationId_birthNumber_idx" ON "subjects"("organizationId", "birthNumber");

-- CreateIndex
CREATE INDEX "subjects_organizationId_lastName_idx" ON "subjects"("organizationId", "lastName");

-- AddForeignKey
ALTER TABLE "subjectContacts" ADD CONSTRAINT "subjectContacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjectContacts" ADD CONSTRAINT "subjectContacts_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjectStatutoryBodies" ADD CONSTRAINT "subjectStatutoryBodies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjectStatutoryBodies" ADD CONSTRAINT "subjectStatutoryBodies_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjectStatutoryBodies" ADD CONSTRAINT "subjectStatutoryBodies_linkedSubjectId_fkey" FOREIGN KEY ("linkedSubjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
