-- Keep the earliest widget of each type per user. Adding a widget now restores
-- the existing one instead of creating another duplicate.
DELETE FROM "dashboardWidgets" duplicate
USING "dashboardWidgets" keeper
WHERE duplicate."userId" = keeper."userId"
  AND duplicate."type" = keeper."type"
  AND (
    duplicate."position" > keeper."position"
    OR (
      duplicate."position" = keeper."position"
      AND duplicate."createdAt" > keeper."createdAt"
    )
    OR (
      duplicate."position" = keeper."position"
      AND duplicate."createdAt" = keeper."createdAt"
      AND duplicate."id" > keeper."id"
    )
  );

CREATE UNIQUE INDEX "dashboardWidgets_userId_type_key"
ON "dashboardWidgets"("userId", "type");
