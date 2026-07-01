-- Hlídání rejstříků: nový typ notifikace. ADD VALUE je ve VLASTNÍ migraci (bez
-- použití nové hodnoty v témže transakčním bloku), aby `migrate deploy` prošel
-- bezpečně (stejný vzor jako u dřívějších enum rozšíření).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REGISTRY_CHANGE';
