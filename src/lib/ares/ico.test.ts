import assert from "node:assert/strict";
import { test } from "node:test";

import { isValidIco, normalizeIco } from "./ico";

test("normalizeIco: strips non-digits and left-pads to 8", () => {
  assert.equal(normalizeIco("12345679"), "12345679");
  assert.equal(normalizeIco("123"), "00000123");
  assert.equal(normalizeIco("CZ 12345679"), "12345679");
  assert.equal(normalizeIco("1 234"), "00001234");
});

test("normalizeIco: null for empty, all-non-digit, or >8 digits", () => {
  assert.equal(normalizeIco(""), null);
  assert.equal(normalizeIco(null), null);
  assert.equal(normalizeIco(undefined), null);
  assert.equal(normalizeIco("abc"), null);
  assert.equal(normalizeIco("123456789"), null); // 9 digits
});

test("isValidIco: accepts a correct mod-11 check digit", () => {
  // 1·8+2·7+3·6+4·5+5·4+6·3+7·2 = 112; 112 % 11 = 2; (11-2) % 10 = 9.
  assert.equal(isValidIco("12345679"), true);
});

test("isValidIco: rejects a wrong check digit", () => {
  assert.equal(isValidIco("12345678"), false);
});

test("isValidIco: rejects non-8-digit input", () => {
  assert.equal(isValidIco("1234567"), false); // 7 digits
  assert.equal(isValidIco("123456790"), false); // 9 digits
  assert.equal(isValidIco("abcdefgh"), false);
});
