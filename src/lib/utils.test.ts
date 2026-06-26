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

test("isSafeHttpUrl: scheme is case-insensitive (URL normalizes to lowercase)", () => {
  // The guard compares against lowercase "http:"/"https:"; URL() lower-cases the
  // scheme, so an uppercased scheme stored by a user must still pass.
  assert.equal(isSafeHttpUrl("HTTP://example.com"), true);
  assert.equal(isSafeHttpUrl("HTTPS://Example.com/Path"), true);
});

test("isSafeHttpUrl: tolerates surrounding whitespace (URL() trims it)", () => {
  // requiredSafeUrl feeds raw FormData here; URL() strips leading/trailing ASCII
  // whitespace, so a padded but otherwise valid link is accepted.
  assert.equal(isSafeHttpUrl("  http://x.com  "), true);
  assert.equal(isSafeHttpUrl("\thttps://x.com\n"), true);
});

test("isSafeHttpUrl: blocks protocol-relative and relative paths (no scheme)", () => {
  // These have no parseable scheme, so storing them as an <a href> link is unsafe.
  assert.equal(isSafeHttpUrl("//evil.com/path"), false);
  assert.equal(isSafeHttpUrl("/relative/path"), false);
  assert.equal(isSafeHttpUrl("example.com/no-scheme"), false);
});

test("isSafeHttpUrl: blocks scheme-confusion / embedded-scheme strings", () => {
  // "https:javascript:..." is not a valid absolute URL → URL() throws → rejected.
  assert.equal(isSafeHttpUrl("https:javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("http ://x.com"), false);
});

test("cn: joins truthy class names, drops falsy", () => {
  assert.equal(cn("a", false, null, "b", undefined), "a b");
  assert.equal(cn(), "");
  assert.equal(cn("only"), "only");
});
