-- Backfill (jen DML, idempotentní): stávající jediný e-mail subjektu se stane
-- hlavním kontaktem typu EMAIL a stávající volný text statutárního orgánu
-- prvním řádkem statutárních orgánů. Původní sloupce "subjects"."email" a
-- "subjects"."statutoryBody" ZŮSTÁVAJÍ (nový kód je dál synchronizuje), nic se
-- nemaže ani nepřepisuje. NOT EXISTS hlídá opakované spuštění i subjekty, které
-- už podřízené řádky mají.

INSERT INTO "subjectContacts" ("id", "organizationId", "subjectId", "type", "value", "valueNormalized", "label", "isPrimary", "position", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."organizationId", s."id", 'EMAIL'::"SubjectContactType", btrim(s."email"), lower(btrim(s."email")), NULL, true, 0, now(), now()
FROM "subjects" s
WHERE s."email" IS NOT NULL
  AND btrim(s."email") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "subjectContacts" c
    WHERE c."subjectId" = s."id" AND c."type" = 'EMAIL'::"SubjectContactType"
  );

INSERT INTO "subjectStatutoryBodies" ("id", "organizationId", "subjectId", "name", "position", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."organizationId", s."id", btrim(s."statutoryBody"), 0, now(), now()
FROM "subjects" s
WHERE s."statutoryBody" IS NOT NULL
  AND btrim(s."statutoryBody") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "subjectStatutoryBodies" b WHERE b."subjectId" = s."id"
  );
