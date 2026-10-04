import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSharepointFolderUrl,
  formatRelativePath,
  parseRelativePath,
  sanitizeSegment,
  sharepointFolderSegments,
  uniqueSharepointFilename,
} from "./sharepoint";

test("sanitizeSegment: strips illegal chars, collapses whitespace, trims", () => {
  assert.equal(sanitizeSegment("a/b:c*d"), "a b c d");
  assert.equal(sanitizeSegment("  hello   world  "), "hello world");
  assert.equal(sanitizeSegment(""), "");
});

test("uniqueSharepointFilename: preserves extension and prevents overwrite", () => {
  assert.equal(
    uniqueSharepointFilename("Smlouva.docx", "a1b2c3d4"),
    "Smlouva (a1b2c3d4).docx",
  );
  assert.equal(
    uniqueSharepointFilename("Plná moc", "v2"),
    "Plná moc (v2)",
  );
});

test("sharepointFolderSegments: Subject uses IČO when present", () => {
  assert.deepEqual(
    sharepointFolderSegments({
      type: "Subject",
      record: { id: "0000000000", name: "ACME", ico: "12345678" },
    }),
    ["Subjekty", "ACME (12345678)"],
  );
});

test("sharepointFolderSegments: Subject falls back to short id when no IČO", () => {
  assert.deepEqual(
    sharepointFolderSegments({
      type: "Subject",
      record: { id: "abc456789", name: "ACME", ico: null },
    }),
    ["Subjekty", "ACME (456789)"],
  );
});

test("sharepointFolderSegments: Project labelled with short id", () => {
  assert.deepEqual(
    sharepointFolderSegments({
      type: "Project",
      record: { id: "proj123456", name: "Spor" },
    }),
    ["Projekty", "Spor (123456)"],
  );
});

test("sharepointFolderSegments: Case nests under its project, uses file number", () => {
  assert.deepEqual(
    sharepointFolderSegments({
      type: "Case",
      record: {
        id: "caseAAAbbb",
        name: "Žaloba",
        fileNumber: "F-1",
        project: { id: "projYYY999", name: "Spor" },
      },
    }),
    ["Projekty", "Spor (YYY999)", "Případy", "Žaloba (F-1)"],
  );
});

test("buildSharepointFolderUrl: null when SHAREPOINT_SITE_URL is unset", async () => {
  // organizationId=null zkratuje čtení z DB → čistý env fallback.
  const saved = process.env.SHAREPOINT_SITE_URL;
  delete process.env.SHAREPOINT_SITE_URL;
  try {
    assert.equal(await buildSharepointFolderUrl(null, ["Subjekty", "ACME"]), null);
  } finally {
    if (saved === undefined) {
      delete process.env.SHAREPOINT_SITE_URL;
    } else {
      process.env.SHAREPOINT_SITE_URL = saved;
    }
  }
});

test("parseRelativePath: zahodí .., . a prázdné segmenty", () => {
  assert.deepEqual(parseRelativePath("a/b/c"), ["a", "b", "c"]);
  assert.deepEqual(parseRelativePath("../../etc"), ["etc"]);
  assert.deepEqual(parseRelativePath("a/../../../b"), ["a", "b"]);
  assert.deepEqual(parseRelativePath("//a///b//"), ["a", "b"]);
  assert.deepEqual(parseRelativePath("a/./b"), ["a", "b"]);
  assert.deepEqual(parseRelativePath("a/..\\b"), ["a"]);
  assert.deepEqual(parseRelativePath(""), []);
  assert.deepEqual(parseRelativePath(null), []);
});

test("parseRelativePath: omezí hloubku", () => {
  const deep = Array.from({ length: 25 }, (_, i) => `s${i}`).join("/");
  assert.equal(parseRelativePath(deep).length, 10);
});

test("formatRelativePath: zpětný převod na ?path=", () => {
  assert.equal(formatRelativePath(["a", "b"]), "a/b");
  assert.equal(formatRelativePath([]), "");
});
