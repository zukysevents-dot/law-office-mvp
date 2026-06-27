// Safety ceiling for list / reference / dropdown queries that don't (yet) have
// real offset/cursor pagination. Prevents an unbounded findMany from loading an
// entire tenant's table into memory and rendering it.
//
// This is a HARD CAP, not a substitute for true pagination — high-volume views
// (tasks, work-logs over the years) should eventually get real paging. Until
// then this bounds the worst case. Aggregations that must read every row use a
// purpose-specific limit (e.g. BILLING_ROW_LIMIT) and are NOT capped by this.
export const LIST_QUERY_LIMIT = 500;
