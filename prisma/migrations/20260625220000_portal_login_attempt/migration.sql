-- CreateTable
CREATE TABLE "portalLoginAttempts" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portalLoginAttempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portalLoginAttempts_ipAddress_createdAt_idx" ON "portalLoginAttempts"("ipAddress", "createdAt");
