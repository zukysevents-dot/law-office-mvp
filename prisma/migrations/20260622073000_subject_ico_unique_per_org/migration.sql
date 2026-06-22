-- IČO is unique PER organization now, not globally — the same company can be a
-- subject of more than one law office (multi-tenant). Existing demo data has
-- distinct (organizationId, ico) pairs, so the new constraint applies cleanly.

-- DropIndex (the old global unique on ico)
DROP INDEX "subjects_ico_key";

-- CreateIndex (per-org unique; NULL ico stays allowed, NULLs are distinct)
CREATE UNIQUE INDEX "subjects_organizationId_ico_key" ON "subjects"("organizationId", "ico");
