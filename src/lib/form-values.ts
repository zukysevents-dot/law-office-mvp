export function dateInputValue(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

export function numberInputValue(
  value: number | string | { toString(): string } | null | undefined,
) {
  if (value === null || value === undefined) {
    return "";
  }

  return value.toString();
}
