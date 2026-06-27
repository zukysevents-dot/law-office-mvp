import { Finding } from "../lib/findings";
import { collectSources, lineAt } from "../lib/walk";
import { extractBalancedParens } from "./util";

const FINDMANY_RE = /\b(\w+)\.(\w+)\.findMany\s*\(/g;

export interface PaginationResult {
  findings: Finding[];
  checked: number;
}

// Flags list-page findMany calls that fetch an unbounded result set (no `take:`
// and no cursor pagination). On large tenants these load every matching row into
// memory and render it — a real scalability hole. We scope to (app) route pages
// so we target list/index views, not internal aggregates.
export function runPaginationGuard(): PaginationResult {
  const sources = collectSources(["src/app"], [".tsx"]).filter(
    (file) => file.relPath.includes("app/(app)/") && file.relPath.endsWith("page.tsx"),
  );
  const findings: Finding[] = [];
  let checked = 0;

  for (const file of sources) {
    const { text } = file;
    let m: RegExpExecArray | null;
    FINDMANY_RE.lastIndex = 0;
    while ((m = FINDMANY_RE.exec(text)) !== null) {
      const [, , model] = m;
      checked += 1;
      const openParen = m.index + m[0].length - 1;
      const args = extractBalancedParens(text, openParen);
      const bounded = /\btake\s*:/.test(args) || /\bcursor\s*:/.test(args);
      if (bounded) {
        continue;
      }
      findings.push({
        rule: "perf/unbounded-list-query",
        severity: "MEDIUM",
        message:
          `findMany na \`${model}\` na list stránce nemá \`take\`/paginaci — ` +
          "načte všechny řádky tenanta (riziko N+1 dopadu a paměti při růstu dat).",
        file: file.relPath,
        line: lineAt(text, m.index),
        evidence: `${model}.findMany(... bez take ...)`,
      });
    }
  }

  return { findings, checked };
}
