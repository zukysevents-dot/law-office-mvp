-- Týmy jako řešitelé projektů a případů + preference notifikace o přiřazení.
--
-- Produkční bezpečnost (expand-only):
--  - jen nové tabulky a nový sloupec s DEFAULT; nic se nemaže, nepřejmenovává,
--    nemění typ a na existující tabulce nevzniká NOT NULL bez DEFAULT;
--  - backfill není potřeba: nové tabulky nic nenahrazují. Osoby zůstávají
--    v "projectAssignees" / "caseAssignees" a týmová přiřazení dosud neexistují.
--    Existující řádky "notificationPreferences" dostanou "matterAssignedEmail"
--    přes DEFAULT true;
--  - kompatibilní s nasazeným kódem: starý kód nové tabulky ani sloupec nečte;
--  - ON DELETE CASCADE na "legalTeamId" se v aplikaci neuplatní (týmy se jen
--    archivují), slouží úklidu testovací databáze.

-- AlterTable
ALTER TABLE "notificationPreferences" ADD COLUMN     "matterAssignedEmail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "projectTeamAssignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "legalTeamId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "projectTeamAssignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caseTeamAssignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "legalTeamId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "caseTeamAssignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projectTeamAssignments_organizationId_idx" ON "projectTeamAssignments"("organizationId");

-- CreateIndex
CREATE INDEX "projectTeamAssignments_projectId_idx" ON "projectTeamAssignments"("projectId");

-- CreateIndex
CREATE INDEX "projectTeamAssignments_legalTeamId_idx" ON "projectTeamAssignments"("legalTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "projectTeamAssignments_projectId_legalTeamId_key" ON "projectTeamAssignments"("projectId", "legalTeamId");

-- CreateIndex
CREATE INDEX "caseTeamAssignments_organizationId_idx" ON "caseTeamAssignments"("organizationId");

-- CreateIndex
CREATE INDEX "caseTeamAssignments_caseId_idx" ON "caseTeamAssignments"("caseId");

-- CreateIndex
CREATE INDEX "caseTeamAssignments_legalTeamId_idx" ON "caseTeamAssignments"("legalTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "caseTeamAssignments_caseId_legalTeamId_key" ON "caseTeamAssignments"("caseId", "legalTeamId");

-- AddForeignKey
ALTER TABLE "projectTeamAssignments" ADD CONSTRAINT "projectTeamAssignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projectTeamAssignments" ADD CONSTRAINT "projectTeamAssignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projectTeamAssignments" ADD CONSTRAINT "projectTeamAssignments_legalTeamId_fkey" FOREIGN KEY ("legalTeamId") REFERENCES "legalTeams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projectTeamAssignments" ADD CONSTRAINT "projectTeamAssignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caseTeamAssignments" ADD CONSTRAINT "caseTeamAssignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caseTeamAssignments" ADD CONSTRAINT "caseTeamAssignments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caseTeamAssignments" ADD CONSTRAINT "caseTeamAssignments_legalTeamId_fkey" FOREIGN KEY ("legalTeamId") REFERENCES "legalTeams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caseTeamAssignments" ADD CONSTRAINT "caseTeamAssignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
