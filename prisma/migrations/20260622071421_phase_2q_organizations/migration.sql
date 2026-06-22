-- Phase 2Q: organizations, join codes, seat limits, platform admin.
-- Hand-edited from the generated diff so it works on a DB that already has
-- legal data: columns are added nullable, backfilled to a seeded demo org,
-- then promoted to NOT NULL. On an empty DB the backfills touch 0 rows.

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrganizationMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seatLimit" INTEGER NOT NULL DEFAULT 0,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "allowedEmailDomains" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizationJoinCodes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "organizationJoinCodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizationMembers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'LAWYER',
    "status" "OrganizationMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizationMembers_pkey" PRIMARY KEY ("id")
);

-- Seed demo organization with a fixed id so the seed script and backfill agree.
INSERT INTO "organizations" ("id", "name", "slug", "seatLimit", "status", "createdAt", "updatedAt")
VALUES ('org-demo-syndikat-legal', 'syndikat.legal demo', 'syndikat-legal-demo', 10, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- AlterTable: platform/developer super-admin flag.
ALTER TABLE "users" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add organizationId nullable first, then backfill + promote.
ALTER TABLE "subjects" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "conflictChecks" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "projects" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "cases" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "tasks" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "workLogs" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "references" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "dashboardWidgets" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "tableViewPreferences" ADD COLUMN "organizationId" TEXT;

-- Backfill all existing rows to the demo organization.
UPDATE "subjects" SET "organizationId" = 'org-demo-syndikat-legal' WHERE "organizationId" IS NULL;
UPDATE "conflictChecks" SET "organizationId" = 'org-demo-syndikat-legal' WHERE "organizationId" IS NULL;
UPDATE "projects" SET "organizationId" = 'org-demo-syndikat-legal' WHERE "organizationId" IS NULL;
UPDATE "cases" SET "organizationId" = 'org-demo-syndikat-legal' WHERE "organizationId" IS NULL;
UPDATE "tasks" SET "organizationId" = 'org-demo-syndikat-legal' WHERE "organizationId" IS NULL;
UPDATE "workLogs" SET "organizationId" = 'org-demo-syndikat-legal' WHERE "organizationId" IS NULL;
UPDATE "references" SET "organizationId" = 'org-demo-syndikat-legal' WHERE "organizationId" IS NULL;
UPDATE "dashboardWidgets" SET "organizationId" = 'org-demo-syndikat-legal' WHERE "organizationId" IS NULL;
UPDATE "tableViewPreferences" SET "organizationId" = 'org-demo-syndikat-legal' WHERE "organizationId" IS NULL;

-- Promote legal entities to NOT NULL (UI prefs stay nullable by design).
ALTER TABLE "subjects" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "conflictChecks" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "cases" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "workLogs" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "references" ALTER COLUMN "organizationId" SET NOT NULL;

-- Needed before the membership backfill so its ON CONFLICT can target it.
CREATE UNIQUE INDEX "organizationMembers_organizationId_userId_key" ON "organizationMembers"("organizationId", "userId");

-- Give every existing user an ACTIVE membership in the demo org so a
-- previously-seeded dev DB does not lock everyone out.
INSERT INTO "organizationMembers" ("id", "organizationId", "userId", "role", "status", "joinedAt", "approvedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'org-demo-syndikat-legal', "id", "role", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("organizationId", "userId") DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "organizationJoinCodes_codeHash_key" ON "organizationJoinCodes"("codeHash");

-- CreateIndex
CREATE INDEX "organizationJoinCodes_organizationId_idx" ON "organizationJoinCodes"("organizationId");

-- CreateIndex
CREATE INDEX "organizationMembers_organizationId_idx" ON "organizationMembers"("organizationId");

-- CreateIndex
CREATE INDEX "organizationMembers_userId_idx" ON "organizationMembers"("userId");

-- CreateIndex
CREATE INDEX "cases_organizationId_idx" ON "cases"("organizationId");

-- CreateIndex
CREATE INDEX "conflictChecks_organizationId_idx" ON "conflictChecks"("organizationId");

-- CreateIndex
CREATE INDEX "dashboardWidgets_organizationId_idx" ON "dashboardWidgets"("organizationId");

-- CreateIndex
CREATE INDEX "projects_organizationId_idx" ON "projects"("organizationId");

-- CreateIndex
CREATE INDEX "references_organizationId_idx" ON "references"("organizationId");

-- CreateIndex
CREATE INDEX "subjects_organizationId_idx" ON "subjects"("organizationId");

-- CreateIndex
CREATE INDEX "tableViewPreferences_organizationId_idx" ON "tableViewPreferences"("organizationId");

-- CreateIndex
CREATE INDEX "tasks_organizationId_idx" ON "tasks"("organizationId");

-- CreateIndex
CREATE INDEX "workLogs_organizationId_idx" ON "workLogs"("organizationId");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflictChecks" ADD CONSTRAINT "conflictChecks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workLogs" ADD CONSTRAINT "workLogs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboardWidgets" ADD CONSTRAINT "dashboardWidgets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tableViewPreferences" ADD CONSTRAINT "tableViewPreferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizationJoinCodes" ADD CONSTRAINT "organizationJoinCodes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizationMembers" ADD CONSTRAINT "organizationMembers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizationMembers" ADD CONSTRAINT "organizationMembers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
