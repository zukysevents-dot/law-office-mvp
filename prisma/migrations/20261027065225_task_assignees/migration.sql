-- Úkoly: více řešitelů a dohled (tabulka "taskAssignees") + preference
-- notifikací o komentáři a o úkolu po termínu.
--
-- Produkční bezpečnost (expand-only):
--  - jen nový typ, nová tabulka a nové sloupce s DEFAULT; nic se nemaže,
--    nepřejmenovává ani nemění typ a na existující tabulce nevzniká NOT NULL
--    bez DEFAULT. Existující řádky "notificationPreferences" dostanou nové
--    sloupce přes DEFAULT true;
--  - použití 'ASSIGNEE' hned po CREATE TYPE je v PostgreSQL legální. Ve stejné
--    transakci nejde použít jen hodnota přidaná přes ALTER TYPE … ADD VALUE –
--    ty jsou v předchozí migraci (task_notification_types) a nikde se nepoužijí;
--  - sloupec "tasks"."assignedToId" zůstává (hlavní řešitel, deprecated);
--  - backfill: každý dosavadní řešitel ("assignedToId") dostane řádek s rolí
--    ASSIGNEE, takže nová tabulka hned odpovídá stávajícím datům;
--  - kompatibilita při rolling deploy: starý kód novou tabulku nečte a dál
--    zapisuje "assignedToId". Nový kód bere "assignedToId" vždy jako řešitele
--    (sjednocení ve všech čteních i where podmínkách), takže se nic neztratí;
--    chybějící řádek vytvoří další úprava úkolu novým kódem;
--  - ON DELETE CASCADE na "taskId" se v aplikaci neuplatní (úkoly se jen
--    archivují), slouží úklidu testovací databáze;
--  - žádná migrace, která už je na origin/main, se neupravuje.

-- CreateEnum
CREATE TYPE "TaskAssigneeRole" AS ENUM ('ASSIGNEE', 'SUPERVISOR');

-- AlterTable
ALTER TABLE "notificationPreferences" ADD COLUMN     "taskCommentedEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taskOverdueEmail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "taskAssignees" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TaskAssigneeRole" NOT NULL DEFAULT 'ASSIGNEE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "taskAssignees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "taskAssignees_organizationId_idx" ON "taskAssignees"("organizationId");

-- CreateIndex
CREATE INDEX "taskAssignees_taskId_idx" ON "taskAssignees"("taskId");

-- CreateIndex
CREATE INDEX "taskAssignees_userId_role_idx" ON "taskAssignees"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "taskAssignees_taskId_userId_key" ON "taskAssignees"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "taskAssignees" ADD CONSTRAINT "taskAssignees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskAssignees" ADD CONSTRAINT "taskAssignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskAssignees" ADD CONSTRAINT "taskAssignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taskAssignees" ADD CONSTRAINT "taskAssignees_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: stávající řešitel úkolu = řešitel (ASSIGNEE) v nové tabulce.
INSERT INTO "taskAssignees" ("id", "organizationId", "taskId", "userId", "role", "assignedAt", "assignedById")
SELECT gen_random_uuid()::text, t."organizationId", t."id", t."assignedToId", 'ASSIGNEE'::"TaskAssigneeRole", t."createdAt", NULL
FROM "tasks" t
WHERE t."assignedToId" IS NOT NULL
ON CONFLICT ("taskId", "userId") DO NOTHING;
