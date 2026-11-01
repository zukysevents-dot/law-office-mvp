-- CreateTable
CREATE TABLE "deadlineExtensions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deadlineId" TEXT NOT NULL,
    "previousDueDate" TIMESTAMP(3) NOT NULL,
    "newDueDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "extendedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deadlineExtensions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deadlineExtensions_organizationId_idx" ON "deadlineExtensions"("organizationId");

-- CreateIndex
CREATE INDEX "deadlineExtensions_deadlineId_createdAt_idx" ON "deadlineExtensions"("deadlineId", "createdAt");

-- CreateIndex
CREATE INDEX "deadlineExtensions_extendedById_idx" ON "deadlineExtensions"("extendedById");

-- AddForeignKey
ALTER TABLE "deadlineExtensions" ADD CONSTRAINT "deadlineExtensions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlineExtensions" ADD CONSTRAINT "deadlineExtensions_deadlineId_fkey" FOREIGN KEY ("deadlineId") REFERENCES "deadlines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlineExtensions" ADD CONSTRAINT "deadlineExtensions_extendedById_fkey" FOREIGN KEY ("extendedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
