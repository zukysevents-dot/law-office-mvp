import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RICH_TEXT_MAX_LENGTH,
  normalizeRichTextInput,
  parseRichText,
  richTextToPlain,
  toggleRichTextMark,
  type RichTextSegment,
} from "./rich-text";

function seg(
  text: string,
  marks: Partial<Pick<RichTextSegment, "bold" | "underline" | "italic">> = {},
): RichTextSegment {
  return {
    text,
    bold: Boolean(marks.bold),
    underline: Boolean(marks.underline),
    italic: Boolean(marks.italic),
  };
}

test("parseRichText: prázdný vstup → žádné úseky", () => {
  assert.deepEqual(parseRichText(""), []);
  assert.deepEqual(parseRichText(null), []);
  assert.deepEqual(parseRichText(undefined), []);
});

test("parseRichText: prostý text je jeden úsek včetně zalomení řádků", () => {
  assert.deepEqual(parseRichText("Dne 21. 10.\nvoláno na KSBR"), [
    seg("Dne 21. 10.\nvoláno na KSBR"),
  ]);
});

test("parseRichText: tučně, podtrženo a kurzíva", () => {
  assert.deepEqual(
    parseRichText("Spisová značka u KSBR je **12 Co 34/2026**."),
    [seg("Spisová značka u KSBR je "), seg("12 Co 34/2026", { bold: true }), seg(".")],
  );
  assert.deepEqual(parseRichText("__důležité__ a *pozor*"), [
    seg("důležité", { underline: true }),
    seg(" a "),
    seg("pozor", { italic: true }),
  ]);
});

test("parseRichText: vnořené a překrývající se značky", () => {
  assert.deepEqual(parseRichText("**tučně __a podtrženo__**"), [
    seg("tučně ", { bold: true }),
    seg("a podtrženo", { bold: true, underline: true }),
  ]);
  assert.deepEqual(parseRichText("***obojí***"), [
    seg("obojí", { bold: true, italic: true }),
  ]);
  assert.deepEqual(parseRichText("**a __b** c__"), [
    seg("a ", { bold: true }),
    seg("b", { bold: true, underline: true }),
    seg(" c", { underline: true }),
  ]);
});

test("parseRichText: nespárované a obklopené mezerou zůstávají doslova", () => {
  assert.deepEqual(parseRichText("5 * 3 = 15"), [seg("5 * 3 = 15")]);
  assert.deepEqual(parseRichText("**neuzavřené"), [seg("**neuzavřené")]);
  assert.deepEqual(parseRichText("snake_case"), [seg("snake_case")]);
  assert.deepEqual(parseRichText("a ** b ** c"), [seg("a ** b ** c")]);
});

test("parseRichText: zpětné lomítko vypíše značku doslova", () => {
  assert.deepEqual(parseRichText("\\*\\*ne\\*\\* a \\\\"), [seg("**ne** a \\")]);
  // Lomítko před jiným znakem zůstává.
  assert.deepEqual(parseRichText("C:\\cesta"), [seg("C:\\cesta")]);
});

test("parseRichText: HTML zůstává jako text (vykresluje se jen přes React)", () => {
  assert.deepEqual(parseRichText("<b>x</b><script>alert(1)</script>"), [
    seg("<b>x</b><script>alert(1)</script>"),
  ]);
});

test("richTextToPlain odstraní spárované značky", () => {
  assert.equal(
    richTextToPlain("**Tučně** a __podtrženo__ a 5 * 3"),
    "Tučně a podtrženo a 5 * 3",
  );
});

test("normalizeRichTextInput: oříznutí, konce řádků, prázdno a délka", () => {
  assert.deepEqual(normalizeRichTextInput("  a\r\nb  "), { ok: true, value: "a\nb" });
  assert.equal(normalizeRichTextInput("   ").ok, false);
  assert.equal(normalizeRichTextInput(null).ok, false);
  assert.equal(normalizeRichTextInput("****").ok, false);
  assert.equal(normalizeRichTextInput("x".repeat(RICH_TEXT_MAX_LENGTH)).ok, true);
  const tooLong = normalizeRichTextInput("x".repeat(RICH_TEXT_MAX_LENGTH + 1));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.ok ? "" : tooLong.error, /příliš dlouhý/);
});

test("toggleRichTextMark: obalí výběr a kurzor zůstane na textu", () => {
  assert.deepEqual(toggleRichTextMark("Spis 12 Co", 5, 10, "bold"), {
    value: "Spis **12 Co**",
    selectionStart: 7,
    selectionEnd: 12,
  });
  assert.deepEqual(toggleRichTextMark("abc", 0, 3, "underline"), {
    value: "__abc__",
    selectionStart: 2,
    selectionEnd: 5,
  });
});

test("toggleRichTextMark: mezery na okrajích výběru zůstanou vně značek", () => {
  assert.deepEqual(toggleRichTextMark("a slovo b", 1, 8, "bold"), {
    value: "a **slovo** b",
    selectionStart: 4,
    selectionEnd: 9,
  });
  // Jen mezery → beze změny.
  assert.deepEqual(toggleRichTextMark("a   b", 1, 4, "bold"), {
    value: "a   b",
    selectionStart: 1,
    selectionEnd: 4,
  });
});

test("toggleRichTextMark: bez výběru vloží pár a kurzor dá doprostřed", () => {
  assert.deepEqual(toggleRichTextMark("ab", 1, 1, "italic"), {
    value: "a**b",
    selectionStart: 2,
    selectionEnd: 2,
  });
});

test("toggleRichTextMark: opakované stisknutí značku odebere", () => {
  const once = toggleRichTextMark("x slovo", 2, 7, "bold");
  assert.equal(once.value, "x **slovo**");
  const twice = toggleRichTextMark(
    once.value,
    once.selectionStart,
    once.selectionEnd,
    "bold",
  );
  assert.deepEqual(twice, { value: "x slovo", selectionStart: 2, selectionEnd: 7 });
  // Výběr včetně značek.
  assert.deepEqual(toggleRichTextMark("__abc__", 0, 7, "underline"), {
    value: "abc",
    selectionStart: 0,
    selectionEnd: 3,
  });
});

test("toggleRichTextMark: kurzíva neodebere hvězdičky tučného páru", () => {
  const result = toggleRichTextMark("**abc**", 2, 5, "italic");
  assert.equal(result.value, "***abc***");
  assert.deepEqual(parseRichText(result.value), [
    seg("abc", { bold: true, italic: true }),
  ]);
});

test("toggleRichTextMark: výběr mimo rozsah se ořízne", () => {
  assert.deepEqual(toggleRichTextMark("ab", 5, 9, "bold"), {
    value: "ab****",
    selectionStart: 4,
    selectionEnd: 4,
  });
});
