CREATE TABLE "tableViewPreferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tableKey" TEXT NOT NULL,
  "visibleColumns" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tableViewPreferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tableViewPreferences_userId_tableKey_key" ON "tableViewPreferences"("userId", "tableKey");
CREATE INDEX "tableViewPreferences_userId_idx" ON "tableViewPreferences"("userId");
CREATE INDEX "tableViewPreferences_tableKey_idx" ON "tableViewPreferences"("tableKey");

ALTER TABLE "tableViewPreferences"
  ADD CONSTRAINT "tableViewPreferences_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
