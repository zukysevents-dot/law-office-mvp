-- NULL seat limit = unlimited accounts (self-founded firms).
ALTER TABLE "organizations" ALTER COLUMN "seatLimit" DROP NOT NULL;
