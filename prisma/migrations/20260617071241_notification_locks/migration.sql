-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "lockedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notifications_status_lockedAt_idx" ON "notifications"("status", "lockedAt");
