-- Existing accounts were created through trusted historical flows, so preserve
-- their ability to sign in. New public registrations are materialized only by
-- the e-mail verification action.
ALTER TABLE "users"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

UPDATE "users"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL;

-- Deliberately NO database default: every new trusted or verified User must set
-- this timestamp explicitly. During a rolling deployment, an old replica can
-- still insert NULL; the new app treats that account as unverified and its
-- verification transaction can safely adopt it after mailbox proof. Drain old
-- replicas promptly so the historical public-registration path is not exposed.

CREATE TABLE "emailVerificationTokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emailVerificationTokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "emailVerificationTokens_tokenHash_key"
ON "emailVerificationTokens"("tokenHash");
CREATE INDEX "emailVerificationTokens_email_createdAt_idx"
ON "emailVerificationTokens"("email", "createdAt");
CREATE INDEX "emailVerificationTokens_expiresAt_idx"
ON "emailVerificationTokens"("expiresAt");

CREATE TABLE "loginAttempts" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loginAttempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loginAttempts_ipAddress_createdAt_idx"
ON "loginAttempts"("ipAddress", "createdAt");
CREATE INDEX "loginAttempts_identifierHash_createdAt_idx"
ON "loginAttempts"("identifierHash", "createdAt");
CREATE INDEX "loginAttempts_createdAt_idx"
ON "loginAttempts"("createdAt");

CREATE TABLE "registrationAttempts" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrationAttempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registrationAttempts_ipAddress_createdAt_idx"
ON "registrationAttempts"("ipAddress", "createdAt");
CREATE INDEX "registrationAttempts_identifierHash_createdAt_idx"
ON "registrationAttempts"("identifierHash", "createdAt");
CREATE INDEX "registrationAttempts_createdAt_idx"
ON "registrationAttempts"("createdAt");
