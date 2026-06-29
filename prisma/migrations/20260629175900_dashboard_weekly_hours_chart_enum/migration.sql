-- Nová hodnota enumu pro týdenní bar-chart widget na dashboardu.
-- Záměrně SAMOSTATNÁ migrace před vytvořením tabulky: PostgreSQL nedovolí
-- použít novou hodnotu enumu ve stejné transakci, ve které byla přidána, a
-- `prisma migrate deploy` obaluje každou migraci do transakce. Oddělením se
-- vyhneme „unsafe use of new value of enum type" pro jakékoli budoucí použití.

-- AlterEnum
ALTER TYPE "DashboardWidgetType" ADD VALUE IF NOT EXISTS 'WEEKLY_HOURS_CHART';
