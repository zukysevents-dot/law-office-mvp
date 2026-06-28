-- Performance: composite indexes for the hottest list/count/aggregate queries.
-- These match the leading filter + sort columns of the dashboard, tasks,
-- work-logs and references pages (all scope by organizationId via the
-- visibility helpers). Names mirror Prisma's @@index naming so `prisma migrate`
-- stays in sync with prisma/schema.prisma.

-- Task counts (org + status) and overdue/upcoming ranges (org + status + deadline order)
CREATE INDEX "tasks_organizationId_status_deadline_idx" ON "tasks"("organizationId", "status", "deadline");

-- WorkLog list (order by workDate desc) and monthly aggregate (workDate range)
CREATE INDEX "workLogs_organizationId_workDate_idx" ON "workLogs"("organizationId", "workDate");

-- Reference list (order by endDate asc)
CREATE INDEX "references_organizationId_endDate_idx" ON "references"("organizationId", "endDate");

-- Project list filtered by status
CREATE INDEX "projects_organizationId_status_idx" ON "projects"("organizationId", "status");

-- Case list filtered by status
CREATE INDEX "cases_organizationId_status_idx" ON "cases"("organizationId", "status");
