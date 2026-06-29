// Tunable knobs for sanctions screening, kept out of the DB so they can be
// adjusted without a migration. Confirm the threshold against real data.

export const SANCTIONS_SOURCE = "EU_CONSOLIDATED";

// Score in [0,1] at/above which a list entry becomes a candidate for review.
// Deliberately not too low: we lack date-of-birth, so we accept more
// false-positives (reviewed by the lawyer) rather than miss a real match.
export const MATCH_THRESHOLD = 0.82;

// Cap on candidates surfaced per screening.
export const MAX_CANDIDATES = 20;

// A local list copy older than this is flagged stale in the UI (does not block
// screening).
export const STALE_AFTER_DAYS = 7;

// Tokenized EU consolidated list URL (per-consumer token from a free EEAS/FISMA
// registration). Returns null when unset — the refresh route then fails closed
// with a clear message instead of hitting a bogus URL.
export function euSanctionsListUrl(): string | null {
  const url = process.env.EU_SANCTIONS_LIST_URL?.trim();
  return url ? url : null;
}
