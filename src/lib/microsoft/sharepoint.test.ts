import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSharepointFolderUrl,
  sanitizeSegment,
  sharepointFolderSegments,
} from "./sharepoint";

test("sanitizeSegment: strips illegal chars, collapses whitespace, trims", () => {
  assert.equal(sanitizeSegment("a/b:c*d"), "a b c d");
  assert.equal(sanitizeSegment("  hello   world  "), "hello world");
  assert.equal(sanitizeSegment(""), "");
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

test("buildSharepointFolderUrl: null when SHAREPOINT_SITE_URL is unset", () => {
  // No env configured in the test process → not derivable.
  assert.equal(buildSharepointFolderUrl(["Subjekty", "ACME"]), null);
});
