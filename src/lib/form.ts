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
