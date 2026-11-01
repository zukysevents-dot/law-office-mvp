/**
 * Diff of submitted child rows (contacts, statutory bodies) against the rows
 * the subject has in the database. Only ids that really belong to THIS
 * subject's existing rows are treated as updates — any other (forged or
 * foreign) id becomes a plain create, so a request can never touch another
 * subject's rows (IDOR). Existing rows missing from the submit are removed.
 */
export function diffChildRows<T extends { id: string | null }>(
  existing: ReadonlyArray<{ id: string }>,
  incoming: ReadonlyArray<T>,
): {
  create: Array<Omit<T, "id">>;
  update: Array<T & { id: string }>;
  remove: string[];
} {
  const existingIds = new Set(existing.map((row) => row.id));
  const claimed = new Set<string>();
  const create: Array<Omit<T, "id">> = [];
  const update: Array<T & { id: string }> = [];

  for (const row of incoming) {
    if (row.id && existingIds.has(row.id) && !claimed.has(row.id)) {
      claimed.add(row.id);
      update.push(row as T & { id: string });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _ignored, ...rest } = row;
      create.push(rest);
    }
  }

  const remove = existing
    .map((row) => row.id)
    .filter((id) => !claimed.has(id));

  return { create, update, remove };
}

/** True when any of `keys` differs (Dates compared by time, null-safe). */
export function rowChanged<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  keys: ReadonlyArray<keyof T>,
): boolean {
  return keys.some((key) => {
    const a = before[key];
    const b = after[key];
    if (a instanceof Date || b instanceof Date) {
      const at = a instanceof Date ? a.getTime() : a ?? null;
      const bt = b instanceof Date ? b.getTime() : b ?? null;
      return at !== bt;
    }
    return (a ?? null) !== (b ?? null);
  });
}
