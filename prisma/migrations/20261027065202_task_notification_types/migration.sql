-- Úkoly: nové typy notifikací – komentář k úkolu a úkol po termínu.
-- ADD VALUE je ve VLASTNÍ migraci a hodnoty se v ní nepoužívají, takže
-- `migrate deploy` projde bezpečně (stejný vzor jako MATTER_ASSIGNED).
-- Expand-only: starý kód hodnoty nezná, ale řádky s nimi vytváří jen nový kód.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_COMMENTED';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_OVERDUE';
