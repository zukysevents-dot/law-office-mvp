-- Expand-only: new table for one-time "set your own password" invitation
-- links (audit 01). Creates a table, indexes and FKs only; no existing table,
-- column or enum is touched and no data is modified. Currently deployed code
-- ignores the table, so this is backward compatible. No backfill needed:
-- existing users simply have no invitation.

-- CreateTable
CREATE TABLE "userInvitationTokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdById" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "userInvitationTokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "userInvitationTokens_tokenHash_key" ON "userInvitationTokens"("tokenHash");

-- CreateIndex
CREATE INDEX "userInvitationTokens_userId_createdAt_idx" ON "userInvitationTokens"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "userInvitationTokens_expiresAt_idx" ON "userInvitationTokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "userInvitationTokens" ADD CONSTRAINT "userInvitationTokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userInvitationTokens" ADD CONSTRAINT "userInvitationTokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userInvitationTokens" ADD CONSTRAINT "userInvitationTokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
