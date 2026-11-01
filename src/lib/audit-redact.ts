// Audit rows store whole records (oldValue/newValue), including rates and
// amounts. A viewer without "Vidí sazby a částky" (e.g. a role an admin gave
// the Audit log section) must not read them from the diffs: such fields are
// replaced by a placeholder before the row is rendered or exported.

export const AUDIT_RATE_FIELDS: ReadonlySet<string> = new Set([
  "hourlyRate",
  "flatFee",
  "feeNote",
  "amountCzk",
  "valueCzk",
]);

export const AUDIT_REDACTED = "skryto";

export function redactAuditRates(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactAuditRates);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
      key,
      AUDIT_RATE_FIELDS.has(key) && inner !== null && inner !== undefined
        ? AUDIT_REDACTED
        : redactAuditRates(inner),
    ]),
  );
}

// Applies the redaction to a row only for viewers without the rate permission.
export function auditRowForViewer<
  T extends { oldValue: unknown; newValue: unknown },
>(row: T, canViewRates: boolean): T {
  if (canViewRates) {
    return row;
  }
  return {
    ...row,
    oldValue: redactAuditRates(row.oldValue),
    newValue: redactAuditRates(row.newValue),
  };
}
