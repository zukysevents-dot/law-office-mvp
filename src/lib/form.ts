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
