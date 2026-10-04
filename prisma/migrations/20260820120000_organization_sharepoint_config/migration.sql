CREATE TABLE "organizationSharepointConfigs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteUrl" TEXT,
  "library" TEXT,
  "tenantId" TEXT,
  "clientId" TEXT,
  "clientSecretEncrypted" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizationSharepointConfigs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizationSharepointConfigs_organizationId_key"
ON "organizationSharepointConfigs"("organizationId");
CREATE INDEX "organizationSharepointConfigs_organizationId_idx"
ON "organizationSharepointConfigs"("organizationId");

ALTER TABLE "organizationSharepointConfigs"
ADD CONSTRAINT "organizationSharepointConfigs_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
