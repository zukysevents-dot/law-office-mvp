-- QA revize: do tabulky "Případy" byl přidán sloupec "Klient" (id "client").
-- Zpřístupníme ho i uživatelům, kteří už mají uložené zobrazení sloupců bez něj,
-- a to jako první sloupec. Uživatelé si ho případně mohou později skrýt.
UPDATE "tableViewPreferences"
SET "visibleColumns" = '["client"]'::jsonb || "visibleColumns"
WHERE "tableKey" = 'cases'
  AND NOT ("visibleColumns" @> '["client"]'::jsonb);
