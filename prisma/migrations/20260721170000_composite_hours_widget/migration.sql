-- The weekly chart now includes the monthly-hours summary in a 3:1 composite.
-- Remove the old standalone card and migrate the retained widget to full width.
DELETE FROM "dashboardWidgets"
WHERE "type" = 'WORK_LOGS_SUMMARY';

UPDATE "dashboardWidgets"
SET
  "title" = CASE
    WHEN "title" = 'Můj týden v hodinách' THEN 'Přehled hodin'
    ELSE "title"
  END,
  "size" = 'FULL',
  "updatedAt" = now()
WHERE "type" = 'WEEKLY_HOURS_CHART';
