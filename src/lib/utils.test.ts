import assert from "node:assert/strict";
import { test } from "node:test";

import { cn, isSafeHttpUrl } from "./utils";

test("isSafeHttpUrl: accepts http(s) URLs only", () => {
  assert.equal(isSafeHttpUrl("https://example.com/path"), true);
  assert.equal(isSafeHttpUrl("http://127.0.0.1:3001"), true);
});

test("isSafeHttpUrl: blocks javascript:/data: and other schemes (XSS guard)", () => {
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,<script>"), false);
  assert.equal(isSafeHttpUrl("ftp://host/file"), false);
  assert.equal(isSafeHttpUrl("mailto:a@b.cz"), false);
});

test("isSafeHttpUrl: false for empty/nullish/non-URL input", () => {
  assert.equal(isSafeHttpUrl(null), false);
  assert.equal(isSafeHttpUrl(undefined), false);
  assert.equal(isSafeHttpUrl(""), false);
  assert.equal(isSafeHttpUrl("not a url"), false);
});

test("cn: joins truthy class names, drops falsy", () => {
  assert.equal(cn("a", false, null, "b", undefined), "a b");
  assert.equal(cn(), "");
  assert.equal(cn("only"), "only");
});
