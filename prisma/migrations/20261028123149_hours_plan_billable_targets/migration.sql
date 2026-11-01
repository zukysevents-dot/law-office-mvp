-- KPI fakturovatelných hodin v plánu hodin pracovníka (balík 08).
-- Čistě expand: dva nové nullable sloupce bez DEFAULT, žádný rewrite tabulky,
-- nic se nemaže ani nepřejmenovává; stávající kód je nezná a nečte.
-- Backfill záměrně žádný: NULL = „cíl nenastaven" (stejně jako u celkových cílů),
-- z existujících dat nejde fakturovatelný cíl odvodit.

-- AlterTable
ALTER TABLE "userHoursPlans" ADD COLUMN     "monthlyBillableHoursTarget" DECIMAL(7,2),
ADD COLUMN     "weeklyBillableHoursTarget" DECIMAL(6,2);
