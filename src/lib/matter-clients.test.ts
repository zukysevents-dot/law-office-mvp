import assert from "node:assert/strict";
import test from "node:test";

import { additionalClientsForMatter, groupClientRelations } from "./matter-clients";

const maps = groupClientRelations([
  { subjectId: "P", projectId: "p1", caseId: null },
  { subjectId: "Q", projectId: "p1", caseId: "c2" },
  { subjectId: "P", projectId: "p1", caseId: null },
  { subjectId: "M", projectId: "p1", caseId: "c2" },
  { subjectId: "R", projectId: null, caseId: null },
]);

test("vazby se seskupí podle projektu a případu bez duplicit", () => {
  assert.deepEqual(maps.byProject.get("p1"), ["P"]);
  assert.deepEqual(maps.byCase.get("c2"), ["Q", "M"]);
  assert.equal(maps.byProject.size, 1);
});

test("klienti případu = klienti projektu + případu, bez hlavního klienta", () => {
  assert.deepEqual(
    additionalClientsForMatter(maps, { projectId: "p1", caseId: "c2", mainSubjectId: "M" }),
    ["P", "Q"],
  );
  assert.deepEqual(
    additionalClientsForMatter(maps, { projectId: "p1", caseId: null, mainSubjectId: "M" }),
    ["P"],
  );
  assert.deepEqual(
    additionalClientsForMatter(maps, { projectId: null, caseId: null, mainSubjectId: null }),
    [],
  );
});
