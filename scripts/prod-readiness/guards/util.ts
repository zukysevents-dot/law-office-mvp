import { lineAt } from "../lib/walk";

// Returns the substring inside the balanced () starting at openIndex (which must
// point at the opening paren). Heuristic: does not skip parens inside strings or
// comments, which is acceptable for the guard's coarse "does this call argument
// mention X" checks.
export function extractBalancedParens(text: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openIndex + 1, i);
      }
    }
  }
  return text.slice(openIndex + 1);
}

export interface ExportChunk {
  name: string;
  body: string;
  line: number;
}

// Splits a module into top-level exported function/const chunks. Action files in
// this repo declare each server action as a flat top-level export, so chunking
// between consecutive `export function|const` markers yields one chunk per
// action — enough to ask "does this action's body contain an authz check?".
export function splitTopLevelExports(text: string): ExportChunk[] {
  const re = /^export\s+(?:async\s+function|function|const)\s+(\w+)/gm;
  const matches = [...text.matchAll(re)];
  const chunks: ExportChunk[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const start = match.index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    chunks.push({
      name: match[1],
      body: text.slice(start, end),
      line: lineAt(text, start),
    });
  }
  return chunks;
}

// Iterates regex matches yielding (matchText, index, line). Resets lastIndex.
export function eachMatch(
  text: string,
  re: RegExp,
  fn: (match: RegExpExecArray, line: number) => void,
): void {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = global.exec(text)) !== null) {
    fn(m, lineAt(text, m.index));
    if (m.index === global.lastIndex) {
      global.lastIndex += 1;
    }
  }
}
