ALTER TABLE "workLogs" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "references" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "workLogs_archivedAt_idx" ON "workLogs"("archivedAt");
CREATE INDEX "references_archivedAt_idx" ON "references"("archivedAt");
