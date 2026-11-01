-- Přiřazení k projektu/případu (osobně nebo přes tým): nový typ notifikace.
-- ADD VALUE je ve VLASTNÍ migraci a hodnota se v ní nepoužívá, takže
-- `migrate deploy` projde bezpečně (stejný vzor jako REGISTRY_CHANGE).
-- Expand-only: starý kód hodnotu nezná, ale řádky s ní vytváří jen nový kód.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MATTER_ASSIGNED';
