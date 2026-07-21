ALTER TABLE "notificationPreferences"
ADD COLUMN "calendarDefaultView" TEXT NOT NULL DEFAULT 'dayGridMonth';

CREATE TABLE "subjectBillingApprovers" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subjectBillingApprovers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subjectBillingApprovers_subjectId_userId_key"
ON "subjectBillingApprovers"("subjectId", "userId");
CREATE INDEX "subjectBillingApprovers_organizationId_idx"
ON "subjectBillingApprovers"("organizationId");
CREATE INDEX "subjectBillingApprovers_userId_idx"
ON "subjectBillingApprovers"("userId");

ALTER TABLE "subjectBillingApprovers"
ADD CONSTRAINT "subjectBillingApprovers_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subjectBillingApprovers"
ADD CONSTRAINT "subjectBillingApprovers_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "subjects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subjectBillingApprovers"
ADD CONSTRAINT "subjectBillingApprovers_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing dashboards receive the new deadlines widget once. Users may still
-- hide, resize, or remove it afterwards in their personal dashboard settings.
INSERT INTO "dashboardWidgets" (
  "id", "userId", "type", "title", "position", "size", "visible", "config",
  "createdAt", "updatedAt"
)
SELECT
  'dashboard-deadlines-' || md5(existing."userId"),
  existing."userId",
  'DEADLINES_PREVIEW'::"DashboardWidgetType",
  'Blížící se lhůty',
  existing."nextPosition",
  'MEDIUM'::"DashboardWidgetSize",
  true,
  '{}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT "userId", COALESCE(MAX("position"), -1) + 1 AS "nextPosition"
  FROM "dashboardWidgets"
  GROUP BY "userId"
) existing
WHERE NOT EXISTS (
  SELECT 1 FROM "dashboardWidgets" widget
  WHERE widget."userId" = existing."userId"
    AND widget."type" = 'DEADLINES_PREVIEW'
);
