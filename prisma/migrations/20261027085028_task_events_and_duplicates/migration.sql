-- Úkoly: historie úkolu (odložení / změny termínu, duplikace) a vazba
-- „vytvořeno duplikací z“.
--
-- Produkční bezpečnost (expand-only):
--   * jen nový typ (TaskEventType), nová tabulka (taskEvents), nullable sloupec
--     tasks."duplicatedFromTaskId", sloupec s DEFAULT
--     notificationPreferences."taskDeadlineChangedEmail" a nové indexy;
--     nic se nemaže, nepřejmenovává ani nemění typ;
--   * backfill není potřeba: nic se nenahrazuje. Dosavadní změny termínu
--     zůstávají v auditLogs (UPDATE úkolu) a nová historie začíná nasazením;
--     duplicatedFromTaskId je u stávajících úkolů správně NULL; stávající
--     preference dostanou taskDeadlineChangedEmail = true přes DEFAULT;
--   * kompatibilita: starý nasazený kód tabulku i sloupce ignoruje. Během
--     nasazení může starý updateTask změnit termín bez události – přijatelné,
--     audit UPDATE změnu zachytí;
--   * ON DELETE CASCADE na taskId se v aplikaci neuplatní (úkoly se jen
--     archivují); slouží úklidu testovací DB;
--   * hodnoty TaskEventType ani NotificationType.TASK_DEADLINE_CHANGED se
--     v migraci nepoužívají (enum hodnota je v předchozí vlastní migraci);
--   * žádná migrace z origin/main se neupravuje.

-- CreateEnum
CREATE TYPE "TaskEventType" AS ENUM ('DEADLINE_POSTPONED', 'DEADLINE_CHANGED', 'DUPLICATED_FROM', 'DUPLICATED_TO');

-- AlterTable
ALTER TABLE "notificationPreferences" ADD COLUMN     "taskDeadlineChangedEmail" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "duplicatedFromTaskId" TEXT;

-- CreateTable
CREATE TABLE "taskEvents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" "TaskEventType" NOT NULL,
    "actorId" TEXT,
    "oldDeadline" TIMESTAMP(3),
    "newDeadline" TIMESTAMP(3),
    "reason" TEXT,
    "viaEdit" BOOLEAN NOT NULL DEFAULT false,
    "relatedTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taskEvents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "taskEvents_organizationId_idx" ON "taskEvents"("organizationId");

-- CreateIndex
CREATE INDEX "taskEvents_taskId_createdAt_idx" ON "taskEvents"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "taskEvents_taskId_type_idx" ON "taskEvents"("taskId", "type");

-- CreateIndex
CREATE INDEX "taskEvents_relatedTaskId_idx" ON "taskEvents"("relatedTaskId");

-- CreateIndex
CREATE INDEX "tasks_organizationId_archivedAt_idx" ON "tasks"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "tasks_organizationId_completedAt_idx" ON "tasks"("organizationId", "completedAt");

-- CreateIndex
CREATE INDEX "tasks_duplicatedFromTaskId_idx" ON "tasks"("duplicatedFromTaskId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_duplicatedFromTaskId_fkey" FOREIGN KEY ("duplicatedFromTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskEvents" ADD CONSTRAINT "taskEvents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskEvents" ADD CONSTRAINT "taskEvents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskEvents" ADD CONSTRAINT "taskEvents_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskEvents" ADD CONSTRAINT "taskEvents_relatedTaskId_fkey" FOREIGN KEY ("relatedTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
