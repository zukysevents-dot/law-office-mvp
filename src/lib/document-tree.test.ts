import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDocumentTree, type TreeDocument } from "./document-tree";

const projects = [
  { id: "p1", name: "Projekt B" },
  { id: "p2", name: "Projekt A" },
];
const cases = [
  { id: "c1", name: "Případ Z", projectId: "p1" },
  { id: "c2", name: "Případ A", projectId: "p1" },
  { id: "c3", name: "Případ jediný", projectId: "p2" },
];

function doc(partial: Partial<TreeDocument>): TreeDocument {
  return {
    id: "d",
    name: "Dok",
    kind: "OTHER",
    caseId: null,
    subjectId: null,
    subjectName: null,
    version: 1,
    ...partial,
  };
}

test("buildDocumentTree: projekty i případy seřazené podle názvu (cs)", () => {
  const tree = buildDocumentTree(projects, cases, []);
  assert.deepEqual(
    tree.projects.map((p) => p.name),
    ["Projekt A", "Projekt B"],
  );
  const projektB = tree.projects.find((p) => p.id === "p1")!;
  assert.deepEqual(
    projektB.cases.map((c) => c.name),
    ["Případ A", "Případ Z"],
  );
});

test("buildDocumentTree: prázdné projekty/případy se zobrazí (workspace, ne jen složky s soubory)", () => {
  const tree = buildDocumentTree(projects, cases, []);
  assert.equal(tree.projects.length, 2);
  assert.equal(tree.totalDocuments, 0);
  for (const p of tree.projects) {
    assert.equal(p.docCount, 0);
  }
});

test("buildDocumentTree: dokument se zařadí pod svůj případ a počítá se do docCount", () => {
  const tree = buildDocumentTree(projects, cases, [
    doc({ id: "d1", name: "Smlouva", caseId: "c1" }),
    doc({ id: "d2", name: "Podání", caseId: "c1" }),
  ]);
  const projektB = tree.projects.find((p) => p.id === "p1")!;
  assert.equal(projektB.docCount, 2);
  const pripadZ = projektB.cases.find((c) => c.id === "c1")!;
  assert.deepEqual(
    pripadZ.documents.map((d) => d.name),
    ["Podání", "Smlouva"],
  );
});

test("buildDocumentTree: dokument jen se subjektem jde pod subjekt", () => {
  const tree = buildDocumentTree(projects, cases, [
    doc({ id: "d1", name: "Plná moc", subjectId: "s1", subjectName: "Klient X" }),
  ]);
  assert.equal(tree.subjects.length, 1);
  assert.equal(tree.subjects[0].name, "Klient X");
  assert.equal(tree.subjects[0].documents[0].name, "Plná moc");
});

test("buildDocumentTree: dokument bez případu i subjektu → nezařazené", () => {
  const tree = buildDocumentTree(projects, cases, [
    doc({ id: "d1", name: "Volný dok" }),
  ]);
  assert.equal(tree.unfiled.length, 1);
  assert.equal(tree.unfiled[0].name, "Volný dok");
});

test("buildDocumentTree: neviditelný subjekt (mimo visibleSubjectIds) → dokument do nezařazených, jméno se neukáže", () => {
  const tree = buildDocumentTree(
    projects,
    cases,
    [
      doc({
        id: "d1",
        name: "Autorův dok",
        subjectId: "skrytý",
        subjectName: "Tajný subjekt",
      }),
      doc({
        id: "d2",
        name: "Viditelný dok",
        subjectId: "viditelný",
        subjectName: "Viditelný subjekt",
      }),
    ],
    new Set(["viditelný"]),
  );
  // skrytý subjekt se nesmí objevit jako skupina ani jménem
  assert.equal(tree.subjects.length, 1);
  assert.equal(tree.subjects[0].name, "Viditelný subjekt");
  assert.deepEqual(
    tree.unfiled.map((d) => d.name),
    ["Autorův dok"],
  );
  // oba dokumenty se počítají, žádný se neztratil
  assert.equal(tree.totalDocuments, 2);
});

test("buildDocumentTree: bez visibleSubjectIds (undefined) se zobrazí všechny subjekty (zpětná kompat)", () => {
  const tree = buildDocumentTree(projects, cases, [
    doc({ id: "d1", name: "Dok", subjectId: "s1", subjectName: "Subjekt" }),
  ]);
  assert.equal(tree.subjects.length, 1);
});

test("buildDocumentTree: caseId mimo viditelné případy nepropadne — spadne do nezařazených/subjektu", () => {
  const tree = buildDocumentTree(projects, cases, [
    doc({ id: "d1", name: "Sirotek", caseId: "neexistuje" }),
    doc({
      id: "d2",
      name: "Sirotek se subjektem",
      caseId: "neexistuje",
      subjectId: "s9",
      subjectName: "Subjekt S",
    }),
  ]);
  // d1 nemá subjekt → nezařazené; d2 má subjekt → subjektová skupina
  assert.equal(tree.unfiled.length, 1);
  assert.equal(tree.unfiled[0].name, "Sirotek");
  assert.equal(tree.subjects.length, 1);
  assert.equal(tree.subjects[0].documents[0].name, "Sirotek se subjektem");
  // ale do totalDocuments se počítají oba (žádný se neztratil)
  assert.equal(tree.totalDocuments, 2);
});
