-- CreateTable
CREATE TABLE "rolePermissionOverrides" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rolePermissionOverrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userPermissionOverrides" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "userPermissionOverrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rolePermissionOverrides_organizationId_idx" ON "rolePermissionOverrides"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "rolePermissionOverrides_organizationId_role_permission_key" ON "rolePermissionOverrides"("organizationId", "role", "permission");

-- CreateIndex
CREATE INDEX "userPermissionOverrides_organizationId_idx" ON "userPermissionOverrides"("organizationId");

-- CreateIndex
CREATE INDEX "userPermissionOverrides_userId_idx" ON "userPermissionOverrides"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "userPermissionOverrides_organizationId_userId_permission_key" ON "userPermissionOverrides"("organizationId", "userId", "permission");

-- AddForeignKey
ALTER TABLE "rolePermissionOverrides" ADD CONSTRAINT "rolePermissionOverrides_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rolePermissionOverrides" ADD CONSTRAINT "rolePermissionOverrides_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userPermissionOverrides" ADD CONSTRAINT "userPermissionOverrides_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userPermissionOverrides" ADD CONSTRAINT "userPermissionOverrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userPermissionOverrides" ADD CONSTRAINT "userPermissionOverrides_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: starší per-user granty (userCapabilityGrants) převést na výjimky
-- uživatele v nové matici oprávnění. Expand-only: stará tabulka zůstává a nový
-- kód ji dál zapisuje souběžně (dual-write) a čte jako fallback, takže grant
-- vytvořený starým kódem během nasazení se neztratí. Idempotentní (ON CONFLICT).
INSERT INTO "userPermissionOverrides" ("id", "organizationId", "userId", "permission", "value", "updatedById", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    g."organizationId",
    g."userId",
    CASE g."capability"
        WHEN 'MANAGE_INVOICES' THEN 'function.manageInvoices'
        WHEN 'VIEW_RATES' THEN 'function.viewRates'
    END,
    'ALLOW',
    g."grantedById",
    g."grantedAt",
    CURRENT_TIMESTAMP
FROM "userCapabilityGrants" g
WHERE g."capability" IN ('MANAGE_INVOICES', 'VIEW_RATES')
ON CONFLICT ("organizationId", "userId", "permission") DO NOTHING;
