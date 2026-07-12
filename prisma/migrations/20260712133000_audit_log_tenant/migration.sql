-- Audit rows need an explicit tenant key. The column stays nullable so legacy
-- records without a reliably reconstructable organization remain preserved.
ALTER TABLE "auditLogs" ADD COLUMN "organizationId" TEXT;

-- These event types already use the organization id as entityId, so their
-- historical rows can be backfilled without inference.
UPDATE "auditLogs" AS audit
SET "organizationId" = audit."entityId"
WHERE audit."entityType" IN (
  'Organization',
  'OrganizationMember',
  'OrganizationJoinCode',
  'OrganizationModule',
  'HrPayrollExport'
)
AND EXISTS (
  SELECT 1
  FROM "organizations" AS organization
  WHERE organization."id" = audit."entityId"
);

-- For all other actor-backed records, backfill only users that have belonged to
-- exactly one organization. Multi-organization actors are deliberately left
-- NULL: choosing either tenant would risk exposing a historical row cross-org.
UPDATE "auditLogs" AS audit
SET "organizationId" = membership."organizationId"
FROM (
  SELECT
    "userId",
    MIN("organizationId") AS "organizationId"
  FROM "organizationMembers"
  GROUP BY "userId"
  HAVING COUNT(DISTINCT "organizationId") = 1
) AS membership
WHERE audit."organizationId" IS NULL
  AND audit."changedById" = membership."userId";

CREATE INDEX "auditLogs_organizationId_createdAt_idx"
ON "auditLogs"("organizationId", "createdAt");

ALTER TABLE "auditLogs"
ADD CONSTRAINT "auditLogs_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
