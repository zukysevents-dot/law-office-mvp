// Pure fuzzy name matching for sanctions screening. Token-set scoring (handles
// reordered name parts) over Jaro-Winkler per token (handles typos and
// transliteration). All inputs are already normalizeName()-d. No I/O.

function jaro(a: string, b: string): number {
  if (a === b) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatched[j] || a[i] !== b[j]) {
        continue;
      }
      aMatched[i] = true;
      bMatched[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) {
    return 0;
  }
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatched[i]) {
      continue;
    }
    while (!bMatched[k]) {
      k += 1;
    }
    if (a[i] !== b[k]) {
      transpositions += 1;
    }
    k += 1;
  }
  transpositions /= 2;
  return (
    (matches / a.length +
      matches / b.length +
      (matches - transpositions) / matches) /
    3
  );
}

export function jaroWinkler(a: string, b: string): number {
  const score = jaro(a, b);
  let prefix = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  for (let i = 0; i < maxPrefix; i += 1) {
    if (a[i] === b[i]) {
      prefix += 1;
    } else {
      break;
    }
  }
  return score + prefix * 0.1 * (1 - score);
}

// Each query token contributes its best Jaro-Winkler match among the entry
// tokens; the average is the token-set score (order-independent).
export function tokenScore(
  queryTokens: string[],
  entryTokens: string[],
): number {
  if (queryTokens.length === 0 || entryTokens.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const queryToken of queryTokens) {
    let best = 0;
    for (const entryToken of entryTokens) {
      const score = jaroWinkler(queryToken, entryToken);
      if (score > best) {
        best = score;
      }
    }
    sum += best;
  }
  return sum / queryTokens.length;
}

// Best score of the query against the primary name and every alias (0..1).
export function scoreNameMatch(
  queryNormalized: string,
  entryNormalized: string,
  aliasesNormalized: string[] = [],
): number {
  const queryTokens = queryNormalized.split(" ").filter(Boolean);
  if (queryTokens.length === 0) {
    return 0;
  }
  let best = 0;
  for (const candidate of [entryNormalized, ...aliasesNormalized]) {
    const score = tokenScore(queryTokens, candidate.split(" ").filter(Boolean));
    if (score > best) {
      best = score;
    }
  }
  return best;
}

export type ScorableEntry = {
  normalizedName: string;
  aliasesNormalized: string[];
};

export type SanctionsCandidate<T extends ScorableEntry> = {
  entry: T;
  score: number;
};

// Score every entry, keep those at/above the threshold, sorted best-first and
// capped at `limit`. Prefer more candidates over a missed match — the lawyer
// reviews them; the software never decides.
export function selectCandidates<T extends ScorableEntry>(
  queryNormalized: string,
  entries: T[],
  options: { threshold: number; limit: number },
): SanctionsCandidate<T>[] {
  return entries
    .map((entry) => ({
      entry,
      score: scoreNameMatch(
        queryNormalized,
        entry.normalizedName,
        entry.aliasesNormalized,
      ),
    }))
    .filter((candidate) => candidate.score >= options.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit);
}
