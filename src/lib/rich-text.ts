// Omezený formát textu pro komentáře u projektů/případů a zpětnou vazbu.
// Uloženo je čisté textové pole (žádné HTML) se třemi značkami:
//   **tučně**   __podtrženo__   *kurzíva*
// Zalomení řádků se zachovává. Značku lze vypsat doslova zpětným lomítkem
// (\*, \_, \\). Vykreslení zajišťuje <RichText> (src/components/rich-text.tsx)
// čistě přes React elementy — bez dangerouslySetInnerHTML, takže uložený text
// nikdy nemůže vložit vlastní HTML ani skript.
//
// Párování značek je tolerantní: značka otevírá, jen když za ní nenásleduje
// mezera, a zavírá, jen když před ní mezera není (jako v Markdownu). Nespárovaná
// značka zůstane v textu doslova, takže „5 * 3“ ani „snake_case“ nic nerozbijí.

export const RICH_TEXT_MAX_LENGTH = 5000;

export type RichTextMark = "bold" | "underline" | "italic";

export type RichTextSegment = {
  text: string;
  bold: boolean;
  underline: boolean;
  italic: boolean;
};

export const RICH_TEXT_MARKERS: Record<RichTextMark, string> = {
  bold: "**",
  underline: "__",
  italic: "*",
};

type Token =
  | { kind: "text"; text: string }
  | {
      kind: "marker";
      mark: RichTextMark;
      raw: string;
      canOpen: boolean;
      canClose: boolean;
      paired: boolean;
    };

const ESCAPABLE = new Set(["*", "_", "\\"]);

function isWhitespace(char: string | undefined) {
  return char === undefined || /\s/.test(char);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      tokens.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };

  let index = 0;
  while (index < source.length) {
    const char = source[index];

    if (char === "\\" && ESCAPABLE.has(source[index + 1] ?? "")) {
      buffer += source[index + 1];
      index += 2;
      continue;
    }

    let mark: RichTextMark | null = null;
    if (source.startsWith("**", index)) {
      mark = "bold";
    } else if (source.startsWith("__", index)) {
      mark = "underline";
    } else if (char === "*") {
      mark = "italic";
    }

    if (!mark) {
      buffer += char;
      index += 1;
      continue;
    }

    const raw = RICH_TEXT_MARKERS[mark];
    const before = source[index - 1];
    const after = source[index + raw.length];
    flush();
    tokens.push({
      kind: "marker",
      mark,
      raw,
      canOpen: !isWhitespace(after),
      canClose: !isWhitespace(before),
      paired: false,
    });
    index += raw.length;
  }

  flush();
  return tokens;
}

// Spáruje značky každého druhu zvlášť (otevírací → nejbližší zavírací).
function pairMarkers(tokens: Token[]) {
  const open: Partial<Record<RichTextMark, number>> = {};
  tokens.forEach((token, index) => {
    if (token.kind !== "marker") {
      return;
    }
    const openIndex = open[token.mark];
    if (openIndex === undefined) {
      if (token.canOpen) {
        open[token.mark] = index;
      }
      return;
    }
    if (token.canClose) {
      const opener = tokens[openIndex];
      if (opener.kind === "marker") {
        opener.paired = true;
      }
      token.paired = true;
      delete open[token.mark];
    }
  });
}

// Rozloží uložený text na úseky se stejným formátováním (sousední úseky se
// stejnými příznaky jsou sloučené, prázdné vynechané).
export function parseRichText(source: string | null | undefined): RichTextSegment[] {
  if (!source) {
    return [];
  }

  const tokens = tokenize(source);
  pairMarkers(tokens);

  const state = { bold: false, underline: false, italic: false };
  const segments: RichTextSegment[] = [];

  const push = (text: string) => {
    if (!text) {
      return;
    }
    const last = segments[segments.length - 1];
    if (
      last &&
      last.bold === state.bold &&
      last.underline === state.underline &&
      last.italic === state.italic
    ) {
      last.text += text;
      return;
    }
    segments.push({ text, ...state });
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      push(token.text);
    } else if (token.paired) {
      state[token.mark] = !state[token.mark];
    } else {
      push(token.raw);
    }
  }

  return segments;
}

// Text bez formátovacích značek (pro audit log, náhledy, vyhledávání).
export function richTextToPlain(source: string | null | undefined): string {
  return parseRichText(source)
    .map((segment) => segment.text)
    .join("");
}

export type RichTextInputResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

// Normalizace vstupu z formuláře: sjednocení konců řádků, oříznutí okrajů,
// kontrola prázdného (i jen ze značek) a příliš dlouhého textu.
export function normalizeRichTextInput(
  raw: FormDataEntryValue | null | undefined,
  maxLength = RICH_TEXT_MAX_LENGTH,
): RichTextInputResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Vyplňte text." };
  }
  const value = raw.replace(/\r\n?/g, "\n").trim();
  if (!value || !richTextToPlain(value).trim()) {
    return { ok: false, error: "Vyplňte text." };
  }
  if (value.length > maxLength) {
    return {
      ok: false,
      error: `Text je příliš dlouhý (nejvýše ${maxLength} znaků).`,
    };
  }
  return { ok: true, value };
}

export type TextSelectionEdit = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

// Tlačítko B / U / I v editoru: obalí výběr značkou, nebo ji odebere, když už
// výběr obalený je (značka těsně před a za výběrem, případně uvnitř něj). Bez
// výběru vloží prázdný pár a kurzor dá doprostřed. Mezery na okrajích výběru
// zůstanou vně značek (jinak by se značka nespárovala).
export function toggleRichTextMark(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  mark: RichTextMark,
): TextSelectionEdit {
  const marker = RICH_TEXT_MARKERS[mark];
  const start = Math.max(0, Math.min(selectionStart, selectionEnd, value.length));
  const end = Math.min(value.length, Math.max(selectionStart, selectionEnd));
  const width = marker.length;

  // Kurzíva „*“ je i součástí „**“ — u kurzívy se vnější hvězdičky odebírají,
  // jen když nejsou součástí tučného páru.
  const isMarkerAt = (position: number) => {
    if (value.slice(position, position + width) !== marker) {
      return false;
    }
    if (mark !== "italic") {
      return true;
    }
    return value[position - 1] !== "*" && value[position + 1] !== "*";
  };

  if (start >= width && isMarkerAt(start - width) && isMarkerAt(end)) {
    return {
      value:
        value.slice(0, start - width) +
        value.slice(start, end) +
        value.slice(end + width),
      selectionStart: start - width,
      selectionEnd: end - width,
    };
  }

  const selected = value.slice(start, end);
  if (
    selected.length >= width * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    (mark !== "italic" ||
      (!selected.startsWith("**") && !selected.endsWith("**")))
  ) {
    const inner = selected.slice(width, selected.length - width);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  if (start === end) {
    return {
      value: value.slice(0, start) + marker + marker + value.slice(end),
      selectionStart: start + width,
      selectionEnd: start + width,
    };
  }

  const leading = selected.length - selected.trimStart().length;
  const trailing = selected.length - selected.trimEnd().length;
  if (leading === selected.length) {
    // Vybrané jsou jen mezery — nic neobalovat.
    return { value, selectionStart: start, selectionEnd: end };
  }
  const innerStart = start + leading;
  const innerEnd = end - trailing;
  return {
    value:
      value.slice(0, innerStart) +
      marker +
      value.slice(innerStart, innerEnd) +
      marker +
      value.slice(innerEnd),
    selectionStart: innerStart + width,
    selectionEnd: innerEnd + width,
  };
}
