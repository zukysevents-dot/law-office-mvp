-- Odpisové billing statusy: skrytý odpis (v archivu, mimo fakturu i výkaz klienta)
-- a viditelný odpis (na výkazu klienta s 0 Kč, mimo fakturu).

-- AlterEnum
ALTER TYPE "BillingStatus" ADD VALUE IF NOT EXISTS 'HIDDEN_WRITE_OFF';
ALTER TYPE "BillingStatus" ADD VALUE IF NOT EXISTS 'VISIBLE_WRITE_OFF';
