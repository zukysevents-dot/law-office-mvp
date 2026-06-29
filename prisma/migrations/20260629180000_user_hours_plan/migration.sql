-- Plán vykázaných hodin pracovníka (týden/měsíc) pro „% plnění" na výkazech
-- a týdenní bar-chart widget na dashboardu. Satelit 1:1 na uživatele.
-- Pozn.: hodnota enumu WEEKLY_HOURS_CHART se přidává v samostatné migraci
-- 20260629175900_dashboard_weekly_hours_chart_enum (kvůli transakční obálce
-- migrate deploy). Tato migrace ji nepoužívá.

-- CreateTable
CREATE TABLE "userHoursPlans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT NOT NULL,
    "weeklyHoursTarget" DECIMAL(6,2),
    "monthlyHoursTarget" DECIMAL(7,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "userHoursPlans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "userHoursPlans_userId_key" ON "userHoursPlans"("userId");

-- CreateIndex
CREATE INDEX "userHoursPlans_organizationId_idx" ON "userHoursPlans"("organizationId");

-- AddForeignKey
ALTER TABLE "userHoursPlans" ADD CONSTRAINT "userHoursPlans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userHoursPlans" ADD CONSTRAINT "userHoursPlans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
