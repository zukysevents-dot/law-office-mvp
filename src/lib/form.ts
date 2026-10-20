export function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`Missing required field: ${key}`);
  }

  return value;
}

export function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function checkboxValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true";
}

export function optionalDate(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  return new Date(`${value}T00:00:00.000Z`);
}

export function requiredDate(formData: FormData, key: string) {
  const value = optionalDate(formData, key);

  if (!value) {
    throw new Error(`Missing required date: ${key}`);
  }

  return value;
}

// For <input type="datetime-local"> values ("2026-06-25T14:30", optionally with
// ":ss"). Such a value has NO timezone; `new Date()` would read it as LOCAL time.
// We pin a bare local datetime to UTC (add missing seconds + "Z") so the stored
// instant matches the entered wall-clock, consistent with how date-only fields
// are stored at UTC midnight elsewhere. Values that already carry a zone (Z or
// ±hh:mm) are left untouched.
export function optionalDateTime(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  const localMatch = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(value);
  const normalized = localMatch
    ? `${localMatch[1]}${localMatch[2] ?? ":00"}Z`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function requiredDateTime(formData: FormData, key: string) {
  const value = optionalDateTime(formData, key);

  if (!value) {
    throw new Error(`Missing required datetime: ${key}`);
  }

  return value;
}

export function requiredNumber(formData: FormData, key: string) {
  const value = optionalString(formData, key);
  const parsed = value ? Number(value.replace(",", ".")) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number: ${key}`);
  }

  return parsed;
}

export function optionalNumber(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function enumValue<T extends Record<string, string>>(
  source: T,
  value: FormDataEntryValue | null,
  fallback: T[keyof T],
) {
  if (typeof value !== "string") {
    return fallback;
  }

  const values = Object.values(source);
  return values.includes(value) ? (value as T[keyof T]) : fallback;
}

// Normalize a client-provided post-action redirect to a same-origin path. URL()
// also catches slash-confusion values such as `/\\evil.example`, which browsers
// can interpret as a cross-origin URL even though they start with one slash.
export function safeInternalRedirectPath(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return fallback;
  }

  const base = "https://law-office.invalid";
  try {
    const target = new URL(value, base);
    return target.origin === base
      ? `${target.pathname}${target.search}${target.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export type IndexedRow<F extends string> = {
  /** Client-side row key (`prefix.<key>.<field>`), stable within one submit. */
  key: string;
  values: Record<F, string>;
};

const INDEXED_ROW_KEY = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Reads repeated form rows named `prefix.<rowKey>.<field>` (e.g.
 * `contact.n1.value`) in DOM order — FormData preserves the order of the
 * controls, so the array index is the row's position. Values are trimmed;
 * a field missing from the submit (e.g. an unchecked checkbox) is "". Unknown
 * fields and malformed keys are ignored, and at most `maxRows` rows are read
 * so a forged request cannot make the server allocate unbounded work.
 */
export function indexedRows<F extends string>(
  formData: FormData,
  prefix: string,
  fields: readonly F[],
  maxRows = 100,
): IndexedRow<F>[] {
  const allowed = new Set<string>(fields);
  const rows = new Map<string, Record<F, string>>();

  for (const [name, raw] of formData.entries()) {
    if (typeof raw !== "string" || !name.startsWith(`${prefix}.`)) {
      continue;
    }
    const rest = name.slice(prefix.length + 1);
    const dot = rest.lastIndexOf(".");
    if (dot <= 0) {
      continue;
    }
    const key = rest.slice(0, dot);
    const field = rest.slice(dot + 1);
    if (!INDEXED_ROW_KEY.test(key) || !allowed.has(field)) {
      continue;
    }

    let row = rows.get(key);
    if (!row) {
      if (rows.size >= maxRows) {
        continue;
      }
      row = Object.fromEntries(fields.map((f) => [f, ""])) as Record<F, string>;
      rows.set(key, row);
    }
    // First occurrence wins (a duplicated control can't override a value).
    if (row[field as F] === "") {
      row[field as F] = raw.trim();
    }
  }

  return Array.from(rows, ([key, values]) => ({ key, values }));
}
