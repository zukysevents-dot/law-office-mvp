CREATE TYPE "DashboardWidgetType" AS ENUM (
  'ACTIVE_TASKS',
  'OVERDUE_TASKS',
  'FOR_REVIEW_TASKS',
  'WAITING_FOR_CLIENT_TASKS',
  'WAITING_FOR_COUNTERPARTY_TASKS',
  'MY_TASKS_TABLE',
  'WORK_LOGS_SUMMARY',
  'WORK_LOGS_TABLE',
  'SUBJECTS_TABLE',
  'PROJECTS_TABLE',
  'CASES_TABLE',
  'REFERENCES_TABLE',
  'RECENT_CONFLICT_CHECKS',
  'CALENDAR_PREVIEW'
);

CREATE TYPE "DashboardWidgetSize" AS ENUM (
  'SMALL',
  'MEDIUM',
  'LARGE',
  'FULL'
);

CREATE TABLE "dashboardWidgets" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "DashboardWidgetType" NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "size" "DashboardWidgetSize" NOT NULL DEFAULT 'MEDIUM',
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dashboardWidgets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dashboardWidgets_userId_position_idx" ON "dashboardWidgets"("userId", "position");
CREATE INDEX "dashboardWidgets_userId_visible_idx" ON "dashboardWidgets"("userId", "visible");

ALTER TABLE "dashboardWidgets"
  ADD CONSTRAINT "dashboardWidgets_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
