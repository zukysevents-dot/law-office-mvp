-- Balíček 09 „Kalendář a lhůty“ – expand-only:
--  * deadlines: nové nullable sloupce completedById / completionNote (kdo a s jakou
--    poznámkou splnění označil). Starý kód je nečte ani nepíše → zpětně kompatibilní.
--  * calendarFeeds: nová tabulka pro osobní Outlook (ICS) kalendář – nedotýká se dat.
--  * Backfill: u již splněných lhůt doplní, kdo je splnil (autor posledního
--    auditního záznamu COMPLETE), a chybějící completedAt (defenzivně = updatedAt).
--    Mění jen NULL hodnoty nových/stávajících sloupců u řádků status = COMPLETED.

-- AlterTable
ALTER TABLE "deadlines" ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "completionNote" TEXT;

-- CreateTable
CREATE TABLE "calendarFeeds" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'OUTLOOK_ICS',
    "secretUrl" TEXT NOT NULL,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "urlHint" TEXT NOT NULL,
    "icsBody" TEXT,
    "etag" TEXT,
    "lastModified" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorStatus" INTEGER,
    "refreshLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendarFeeds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendarFeeds_userId_idx" ON "calendarFeeds"("userId");

-- CreateIndex
CREATE INDEX "calendarFeeds_fetchedAt_idx" ON "calendarFeeds"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendarFeeds_organizationId_userId_key" ON "calendarFeeds"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "deadlines_completedById_idx" ON "deadlines"("completedById");

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendarFeeds" ADD CONSTRAINT "calendarFeeds_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendarFeeds" ADD CONSTRAINT "calendarFeeds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: kdo splnil existující COMPLETED lhůty = autor posledního COMPLETE auditu.
UPDATE "deadlines" AS d
SET "completedById" = a."changedById"
FROM (
  SELECT DISTINCT ON (l."entityId") l."entityId", l."changedById"
  FROM "auditLogs" AS l
  JOIN "users" AS u ON u."id" = l."changedById"
  WHERE l."entityType" = 'Deadline'
    AND l."action" = 'COMPLETE'
    AND l."changedById" IS NOT NULL
  ORDER BY l."entityId", l."createdAt" DESC
) AS a
WHERE d."id" = a."entityId"
  AND d."status" = 'COMPLETED'
  AND d."completedById" IS NULL;

-- Backfill: COMPLETED bez completedAt (nemělo by nastat) dostane updatedAt.
UPDATE "deadlines"
SET "completedAt" = "updatedAt"
WHERE "status" = 'COMPLETED'
  AND "completedAt" IS NULL;
