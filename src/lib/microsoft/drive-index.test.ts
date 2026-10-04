import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDriveIndex,
  filterDriveEntries,
  hasActiveFilters,
  normalizeForSearch,
  parseExplorerFilters,
  type DriveEntry,
} from "./drive-index";

// Delta odpověď bez parentReference.path — cesty se skládají přes id.
const RAW = [
  { id: "root", root: {}, name: "root" },
  { id: "a", name: "Klienti", folder: { childCount: 1 }, parentReference: { id: "root" } },
  { id: "b", name: "Novák", folder: { childCount: 2 }, parentReference: { id: "a" } },
  {
    id: "c",
    name: "Smlouva.docx",
    file: {},
    size: 2048,
    lastModifiedDateTime: "2026-10-01T10:00:00Z",
    lastModifiedBy: { user: { displayName: "Jana" } },
    webUrl: "https://contoso.sharepoint.com/c",
    parentReference: { id: "b" },
  },
  { id: "d", name: "Korespondence", folder: { childCount: 1 }, parentReference: { id: "b" } },
  {
    id: "e",
    name: "Návrh žaloby.pdf",
    file: {},
    lastModifiedDateTime: "2026-01-15T08:00:00Z",
    parentReference: { id: "d" },
  },
  { id: "x", name: "Smazaný.txt", deleted: {}, parentReference: { id: "b" } },
  { id: "o", name: "Sirotek.txt", file: {}, parentReference: { id: "chybi" } },
];

const NOW = new Date("2026-10-04T12:00:00Z");

function index(): DriveEntry[] {
  return buildDriveIndex(RAW);
}

test("buildDriveIndex: skládá cesty přes parentReference.id", () => {
  const byName = Object.fromEntries(index().map((entry) => [entry.name, entry]));
  assert.deepEqual(byName["Klienti"].parentSegments, []);
  assert.deepEqual(byName["Smlouva.docx"].parentSegments, ["Klienti", "Novák"]);
  assert.deepEqual(byName["Návrh žaloby.pdf"].parentSegments, [
    "Klienti",
    "Novák",
    "Korespondence",
  ]);
  assert.equal(byName["Smlouva.docx"].lastModifiedBy, "Jana");
  assert.equal(byName["Klienti"].isFolder, true);
});

test("buildDriveIndex: vynechá kořen, smazané a položky bez předka", () => {
  const names = index().map((entry) => entry.name);
  assert.ok(!names.includes("root"));
  assert.ok(!names.includes("Smazaný.txt"));
  assert.ok(!names.includes("Sirotek.txt"));
});

test("normalizeForSearch: ignoruje diakritiku a velikost písmen", () => {
  assert.equal(normalizeForSearch("Návrh ŽALOBY"), "navrh zaloby");
});

test("parseExplorerFilters: neznámé hodnoty spadnou na výchozí", () => {
  const filters = parseExplorerFilters({ modified: "hack", kind: "x", sort: "y" });
  assert.equal(filters.modified, "any");
  assert.equal(filters.kind, "all");
  assert.equal(filters.sort, "name");
  assert.equal(hasActiveFilters(filters), false);
});

test("parseExplorerFilters: vyplněné datum znamená vlastní rozsah", () => {
  const filters = parseExplorerFilters({ from: "2026-09-01", to: "nesmysl" });
  assert.equal(filters.modified, "custom");
  assert.equal(filters.from, "2026-09-01");
  assert.equal(filters.to, null);
  assert.equal(hasActiveFilters(filters), true);
});

test("filterDriveEntries: název bez diakritiky, rekurzivně pod složkou", () => {
  const result = filterDriveEntries(
    index(),
    ["Klienti"],
    parseExplorerFilters({ q: "navrh" }),
    NOW,
  );
  assert.deepEqual(result.map((entry) => entry.name), ["Návrh žaloby.pdf"]);
});

test("filterDriveEntries: mimo prohlíženou složku nic nenajde", () => {
  const result = filterDriveEntries(
    index(),
    ["Jiná"],
    parseExplorerFilters({ q: "smlouva" }),
    NOW,
  );
  assert.equal(result.length, 0);
});

test("filterDriveEntries: filtr názvu složky hledá jen pod prohlíženou složkou", () => {
  const filters = parseExplorerFilters({ folder: "korespond", kind: "files" });
  assert.deepEqual(
    filterDriveEntries(index(), [], filters, NOW).map((entry) => entry.name),
    ["Návrh žaloby.pdf"],
  );
  // Prohlížená složka sama se nepočítá — jinak by „Klienti" vyhověli všemu.
  const self = parseExplorerFilters({ folder: "klienti" });
  assert.equal(filterDriveEntries(index(), ["Klienti"], self, NOW).length, 0);
});

test("filterDriveEntries: časové předvolby a vlastní rozsah", () => {
  const last7 = filterDriveEntries(index(), [], parseExplorerFilters({ modified: "7d" }), NOW);
  assert.deepEqual(last7.map((entry) => entry.name), ["Smlouva.docx"]);

  const january = filterDriveEntries(
    index(),
    [],
    parseExplorerFilters({ modified: "custom", from: "2026-01-15", to: "2026-01-15" }),
    NOW,
  );
  assert.deepEqual(january.map((entry) => entry.name), ["Návrh žaloby.pdf"]);
});

test("filterDriveEntries: řazení podle změny, nejnovější první", () => {
  const result = filterDriveEntries(
    index(),
    [],
    parseExplorerFilters({ kind: "files", sort: "modified" }),
    NOW,
  );
  assert.deepEqual(result.map((entry) => entry.name), ["Smlouva.docx", "Návrh žaloby.pdf"]);
});
