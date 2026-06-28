export type TaskLimitResult<T> = {
  visible: T[];
  truncated: boolean;
};

// Pair with a `take: limit + 1` query: fetching one row beyond the limit lets us
// distinguish "exactly limit rows" (not truncated) from "more than limit"
// (truncated) without a false positive. When truncated, trim back to `limit`.
export function applyTaskLimit<T>(rows: T[], limit: number): TaskLimitResult<T> {
  const truncated = rows.length > limit;
  return {
    visible: truncated ? rows.slice(0, limit) : rows,
    truncated,
  };
}
