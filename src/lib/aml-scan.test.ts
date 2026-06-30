import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_SCAN_NOTE_LENGTH,
  MAX_SCAN_URL_LENGTH,
  normalizeScanFields,
  validateScanUrl,
} from "./aml-scan";

const NOW = new Date("2026-06-29T10:00:00.000Z");

// --- validateScanUrl ---------------------------------------------------------

test("validateScanUrl: prázdná/null/undefined URL je validní (= mazání skenu)", () => {
  assert.doesNotThrow(() => validateScanUrl(null));
  assert.doesNotThrow(() => validateScanUrl(undefined));
  assert.doesNotThrow(() => validateScanUrl(""));
});

test("validateScanUrl: validní https/http projde", () => {
  assert.doesNotThrow(() =>
    validateScanUrl("https://sharepoint.example.com/sken.pdf"),
  );
  assert.doesNotThrow(() => validateScanUrl("http://10.0.0.1/sken"));
});

test("validateScanUrl: nebezpečná/neplatná schémata → throw (XSS/odkaz)", () => {
  // Integrace s isSafeHttpUrl (ten je sám testovaný v utils.test.ts).
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<script>",
    "ftp://host/file",
    "/relativni/cesta",
    "//protocol-relative.com",
    "sken.pdf",
  ]) {
    assert.throws(
      () => validateScanUrl(bad),
      /platná http\(s\) adresa/,
      `mělo odmítnout: ${bad}`,
    );
  }
});

test("validateScanUrl: URL přesně na limitu projde, o znak delší → throw", () => {
  // base = "https://x.cz/" (13 znaků) + padding do požadované délky
  const base = "https://x.cz/";
  const atLimit = base + "a".repeat(MAX_SCAN_URL_LENGTH - base.length);
  assert.equal(atLimit.length, MAX_SCAN_URL_LENGTH);
  assert.doesNotThrow(() => validateScanUrl(atLimit));

  const tooLong = base + "a".repeat(MAX_SCAN_URL_LENGTH - base.length + 1);
  assert.equal(tooLong.length, MAX_SCAN_URL_LENGTH + 1);
  assert.throws(() => validateScanUrl(tooLong), /příliš dlouhý/);
});

// --- normalizeScanFields -----------------------------------------------------

test("normalizeScanFields: validní URL → projde a uploadedAt = now", () => {
  const r = normalizeScanFields(
    {
      scanUrl: "https://store.example.com/doc.pdf",
      scanFileName: "doc.pdf",
      scanNote: "OP, ověřeno",
    },
    NOW,
  );
  assert.deepEqual(r, {
    scanUrl: "https://store.example.com/doc.pdf",
    scanFileName: "doc.pdf",
    scanNote: "OP, ověřeno",
    scanUploadedAt: NOW,
  });
});

test("normalizeScanFields: prázdná URL → vše vynulováno (mazání skenu)", () => {
  // I když fileName/note přijdou vyplněné, bez URL nemají smysl → null.
  const r = normalizeScanFields(
    { scanUrl: "", scanFileName: "doc.pdf", scanNote: "zbytek po smazání" },
    NOW,
  );
  assert.deepEqual(r, {
    scanUrl: null,
    scanFileName: null,
    scanNote: null,
    scanUploadedAt: null,
  });
});

test("normalizeScanFields: null URL → stejné chování jako prázdná", () => {
  const r = normalizeScanFields(
    { scanUrl: null, scanFileName: "x", scanNote: "y" },
    NOW,
  );
  assert.deepEqual(r, {
    scanUrl: null,
    scanFileName: null,
    scanNote: null,
    scanUploadedAt: null,
  });
});

test("normalizeScanFields: nebezpečná URL → throw, nic se nenormalizuje", () => {
  assert.throws(
    () =>
      normalizeScanFields(
        { scanUrl: "javascript:alert(1)", scanFileName: null, scanNote: null },
        NOW,
      ),
    /platná http\(s\) adresa/,
  );
});

test("normalizeScanFields: poznámka přesně na limitu projde, delší → throw", () => {
  const url = "https://x.cz/sken";
  const noteAtLimit = "a".repeat(MAX_SCAN_NOTE_LENGTH);
  assert.doesNotThrow(() =>
    normalizeScanFields(
      { scanUrl: url, scanFileName: null, scanNote: noteAtLimit },
      NOW,
    ),
  );

  const noteTooLong = "a".repeat(MAX_SCAN_NOTE_LENGTH + 1);
  assert.throws(
    () =>
      normalizeScanFields(
        { scanUrl: url, scanFileName: null, scanNote: noteTooLong },
        NOW,
      ),
    /Poznámka ke skenu je příliš dlouhá/,
  );
});

test("normalizeScanFields: dlouhá poznámka BEZ URL se NEvaliduje (note se zahodí)", () => {
  // Bez URL se note nuluje dřív, než by se kontrolovala délka — nesmí throw.
  const r = normalizeScanFields(
    {
      scanUrl: "",
      scanFileName: null,
      scanNote: "a".repeat(MAX_SCAN_NOTE_LENGTH + 100),
    },
    NOW,
  );
  assert.equal(r.scanNote, null);
});
