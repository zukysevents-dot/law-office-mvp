-- Granulární per-user oprávnění (capability granty nad rámec role).
-- Nový enum + tabulka. Default fakturace se v kódu zužuje z {ADMIN,PARTNER,
-- LAWYER} na {ADMIN,PARTNER}; data-migrace níže zachová fakturaci stávajícím
-- aktivním advokátům (no-regression) — admin je pak může odebrat v Nastavení.

-- CreateEnum
CREATE TYPE "Capability" AS ENUM ('MANAGE_INVOICES', 'VIEW_RATES');

-- CreateTable
CREATE TABLE "userCapabilityGrants" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" "Capability" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT,

    CONSTRAINT "userCapabilityGrants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "userCapabilityGrants_userId_capability_key" ON "userCapabilityGrants"("userId", "capability");

-- CreateIndex
CREATE INDEX "userCapabilityGrants_organizationId_idx" ON "userCapabilityGrants"("organizationId");

-- CreateIndex
CREATE INDEX "userCapabilityGrants_userId_idx" ON "userCapabilityGrants"("userId");

-- AddForeignKey
ALTER TABLE "userCapabilityGrants" ADD CONSTRAINT "userCapabilityGrants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userCapabilityGrants" ADD CONSTRAINT "userCapabilityGrants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userCapabilityGrants" ADD CONSTRAINT "userCapabilityGrants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data-migrace: zachovej fakturaci stávajícím aktivním advokátům (LAWYER),
-- protože default helperu se zužuje na ADMIN/PARTNER. ON CONFLICT kvůli
-- @@unique([userId, capability]).
INSERT INTO "userCapabilityGrants" ("id", "organizationId", "userId", "capability", "grantedAt", "grantedById")
SELECT gen_random_uuid()::text, m."organizationId", m."userId", 'MANAGE_INVOICES'::"Capability", now(), NULL
FROM "organizationMembers" m
WHERE m."status" = 'ACTIVE' AND m."role" = 'LAWYER'
ON CONFLICT ("userId", "capability") DO NOTHING;
