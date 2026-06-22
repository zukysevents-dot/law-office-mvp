import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCsvBody, csvCell, csvNumber, csvResponse } from "./csv";

// --- csvCell: spreadsheet formula-injection neutralization + quoting ---
test("csvCell: passes through a plain value", () => {
  assert.equal(csvCell("hello"), "hello");
});

test("csvCell: prefixes formula-trigger leading chars with an apostrophe", () => {
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("-1"), "'-1");
  assert.equal(csvCell("@cmd"), "'@cmd");
});

test("csvCell: quotes values containing separator/quote/newline", () => {
  assert.equal(csvCell("a;b"), '"a;b"');
  assert.equal(csvCell('a"b'), '"a""b"'); // inner quote doubled
  assert.equal(csvCell("a\nb"), '"a\nb"');
});

test("csvCell: combines neutralization and quoting", () => {
  assert.equal(csvCell("=a;b"), `"'=a;b"`);
});

// --- csvNumber: Czech decimal convention ---
test("csvNumber: comma decimal separator, 2 places; null → empty", () => {
  assert.equal(csvNumber(1234.5), "1234,50");
  assert.equal(csvNumber(0), "0,00");
  assert.equal(csvNumber(null), "");
});

// --- buildCsvBody: BOM + ; separators + CRLF ---
test("buildCsvBody: BOM, headers, CRLF rows", () => {
  assert.equal(buildCsvBody(["a", "b"], [["1", "2"], ["3", "4"]]), "﻿a;b\r\n1;2\r\n3;4");
});

test("buildCsvBody: empty rows still emits the header line", () => {
  assert.equal(buildCsvBody(["a", "b"], []), "﻿a;b");
});

test("csvResponse: sets CSV content-type and attachment filename", () => {
  const res = csvResponse("export.csv", "body");
  assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
  assert.equal(
    res.headers.get("content-disposition"),
    'attachment; filename="export.csv"',
  );
});
