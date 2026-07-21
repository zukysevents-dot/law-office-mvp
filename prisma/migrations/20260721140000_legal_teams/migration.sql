CREATE TABLE "legalTeams" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "legalTeams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legalTeamMembers" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "legalTeamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legalTeamMembers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legalTeams_organizationId_name_key"
ON "legalTeams"("organizationId", "name");
CREATE INDEX "legalTeams_organizationId_idx" ON "legalTeams"("organizationId");
CREATE UNIQUE INDEX "legalTeamMembers_organizationId_userId_key"
ON "legalTeamMembers"("organizationId", "userId");
CREATE UNIQUE INDEX "legalTeamMembers_legalTeamId_userId_key"
ON "legalTeamMembers"("legalTeamId", "userId");
CREATE INDEX "legalTeamMembers_organizationId_idx"
ON "legalTeamMembers"("organizationId");
CREATE INDEX "legalTeamMembers_legalTeamId_idx" ON "legalTeamMembers"("legalTeamId");
CREATE INDEX "legalTeamMembers_userId_idx" ON "legalTeamMembers"("userId");

ALTER TABLE "legalTeams"
ADD CONSTRAINT "legalTeams_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "legalTeamMembers"
ADD CONSTRAINT "legalTeamMembers_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legalTeamMembers"
ADD CONSTRAINT "legalTeamMembers_legalTeamId_fkey"
FOREIGN KEY ("legalTeamId") REFERENCES "legalTeams"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legalTeamMembers"
ADD CONSTRAINT "legalTeamMembers_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
