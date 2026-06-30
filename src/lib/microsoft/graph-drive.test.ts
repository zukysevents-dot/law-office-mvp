import assert from "node:assert/strict";
import { test } from "node:test";

import {
  encodeDrivePath,
  graphSiteResource,
  parseSharepointSiteUrl,
} from "./graph-drive";

// --- parseSharepointSiteUrl --------------------------------------------------

test("parseSharepointSiteUrl: web s cestou", () => {
  assert.deepEqual(
    parseSharepointSiteUrl("https://contoso.sharepoint.com/sites/Law"),
    { hostname: "contoso.sharepoint.com", sitePath: "/sites/Law" },
  );
});

test("parseSharepointSiteUrl: kořenový web (bez cesty)", () => {
  assert.deepEqual(parseSharepointSiteUrl("https://contoso.sharepoint.com"), {
    hostname: "contoso.sharepoint.com",
    sitePath: "",
  });
});

test("parseSharepointSiteUrl: ořízne koncové lomítko", () => {
  assert.deepEqual(
    parseSharepointSiteUrl("https://contoso.sharepoint.com/sites/Law/"),
    { hostname: "contoso.sharepoint.com", sitePath: "/sites/Law" },
  );
});

test("parseSharepointSiteUrl: neplatná URL → null", () => {
  assert.equal(parseSharepointSiteUrl("nene"), null);
  assert.equal(parseSharepointSiteUrl(""), null);
});

test("parseSharepointSiteUrl: non-http schéma → null", () => {
  assert.equal(parseSharepointSiteUrl("ftp://contoso.com/x"), null);
});

// --- graphSiteResource -------------------------------------------------------

test("graphSiteResource: web s cestou → /sites/{host}:{path}", () => {
  assert.equal(
    graphSiteResource({ hostname: "contoso.sharepoint.com", sitePath: "/sites/Law" }),
    "/sites/contoso.sharepoint.com:/sites/Law",
  );
});

test("graphSiteResource: kořenový web → /sites/{host}", () => {
  assert.equal(
    graphSiteResource({ hostname: "contoso.sharepoint.com", sitePath: "" }),
    "/sites/contoso.sharepoint.com",
  );
});

// --- encodeDrivePath ---------------------------------------------------------

test("encodeDrivePath: enkóduje segmenty a spojí lomítkem", () => {
  assert.equal(
    encodeDrivePath(["Projekty", "Spor (123)", "Případy"]),
    "Projekty/Spor%20(123)/P%C5%99%C3%ADpady",
  );
});

test("encodeDrivePath: vynechá prázdné segmenty", () => {
  assert.equal(encodeDrivePath(["a", "", "b"]), "a/b");
});
