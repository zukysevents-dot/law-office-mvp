-- Every active org member gets an HR employee card (attendance, punches and
-- absences require one). Same name split as splitPersonName(): the last word
-- is the surname. Users already linked to any card (archived included) are
-- skipped; new members get their card from ensureEmployeeCard().
WITH members AS (
  SELECT DISTINCT ON (u."id")
    m."organizationId",
    u."id" AS "userId",
    btrim(regexp_replace(u."name", '\s+', ' ', 'g')) AS "name"
  FROM "organizationMembers" m
  JOIN "users" u ON u."id" = m."userId"
  WHERE m."status" = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM "hrEmployees" e WHERE e."userId" = u."id")
  ORDER BY u."id", m."joinedAt"
),
created AS (
  INSERT INTO "hrEmployees" ("id", "organizationId", "userId", "firstName", "lastName", "createdById", "updatedAt")
  SELECT
    gen_random_uuid()::text,
    "organizationId",
    "userId",
    CASE WHEN position(' ' IN "name") > 0 THEN regexp_replace("name", ' [^ ]+$', '') ELSE "name" END,
    CASE WHEN position(' ' IN "name") > 0 THEN regexp_replace("name", '^.* ', '') ELSE '' END,
    "userId",
    CURRENT_TIMESTAMP
  FROM members
  RETURNING "id", "organizationId", "userId", "firstName", "lastName"
)
INSERT INTO "auditLogs" ("id", "organizationId", "entityType", "entityId", "action", "changedById", "newValue")
SELECT
  gen_random_uuid()::text,
  "organizationId",
  'HrEmployee',
  "id",
  'CREATE',
  NULL,
  jsonb_build_object(
    'firstName', "firstName",
    'lastName', "lastName",
    'userId', "userId",
    'autoCreated', true
  )
FROM created;
