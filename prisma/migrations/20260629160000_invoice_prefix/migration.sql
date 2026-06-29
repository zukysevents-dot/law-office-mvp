-- Konfigurovatelný prefix čísla faktury (číslo má tvar PREFIX_ROK_MĚSÍC_pořadové).

-- AlterTable
ALTER TABLE "organizationBillingProfiles" ADD COLUMN "invoicePrefix" TEXT NOT NULL DEFAULT 'AK';
