-- CreateEnum
CREATE TYPE "HrNewsAudience" AS ENUM ('ALL', 'ROLES', 'USERS');

-- CreateEnum
CREATE TYPE "HrPresenceStatus" AS ENUM ('OFFICE', 'HOME_OFFICE', 'OUT_OF_OFFICE');

-- AlterEnum
ALTER TYPE "DashboardWidgetType" ADD VALUE 'HR_NEWS';

-- CreateTable
CREATE TABLE "hrNews" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "HrNewsAudience" NOT NULL DEFAULT 'ALL',
    "audienceRoles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "visibleUntil" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "hrNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hrNewsRecipients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hrNewsRecipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hrPresencePlans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "HrPresenceStatus" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hrPresencePlans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hrNews_organizationId_archivedAt_idx" ON "hrNews"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "hrNewsRecipients_organizationId_idx" ON "hrNewsRecipients"("organizationId");

-- CreateIndex
CREATE INDEX "hrNewsRecipients_userId_idx" ON "hrNewsRecipients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "hrNewsRecipients_newsId_userId_key" ON "hrNewsRecipients"("newsId", "userId");

-- CreateIndex
CREATE INDEX "hrPresencePlans_organizationId_date_idx" ON "hrPresencePlans"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "hrPresencePlans_employeeId_date_key" ON "hrPresencePlans"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "hrNews" ADD CONSTRAINT "hrNews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrNews" ADD CONSTRAINT "hrNews_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrNews" ADD CONSTRAINT "hrNews_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrNewsRecipients" ADD CONSTRAINT "hrNewsRecipients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrNewsRecipients" ADD CONSTRAINT "hrNewsRecipients_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "hrNews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrNewsRecipients" ADD CONSTRAINT "hrNewsRecipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrPresencePlans" ADD CONSTRAINT "hrPresencePlans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hrPresencePlans" ADD CONSTRAINT "hrPresencePlans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hrEmployees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
