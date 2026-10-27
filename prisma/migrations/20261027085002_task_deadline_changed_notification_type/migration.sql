-- Úkoly: nový typ notifikace – odložení nebo jiná změna termínu úkolu.
-- ADD VALUE je ve VLASTNÍ migraci a hodnota se v ní nepoužívá, takže
-- `migrate deploy` projde bezpečně (stejný vzor jako TASK_COMMENTED).
-- Expand-only: starý kód hodnotu nezná, ale řádky s ní vytváří jen nový kód.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DEADLINE_CHANGED';
