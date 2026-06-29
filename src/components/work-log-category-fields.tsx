"use client";

import { useState } from "react";

import { Field, SelectInput } from "@/components/form-field";

type Option = { value: string; label: string };

// Billing status + the matching category field. Lawyers asked that interní
// (nefakturovatelné) hours offer internal work categories instead of a legal
// area — so the second field swaps based on the chosen billing status. Only the
// relevant field is rendered, so the other is simply not submitted (and cleared
// server-side).
export function WorkLogCategoryFields({
  billingStatusOptions,
  defaultBillingStatus,
  legalAreas,
  internalCategories,
  defaultLegalArea = "",
  defaultInternalCategory = "",
  internalStatusValue = "INTERNAL_NON_BILLABLE",
}: {
  billingStatusOptions: Option[];
  defaultBillingStatus: string;
  legalAreas: string[];
  internalCategories: Option[];
  defaultLegalArea?: string;
  defaultInternalCategory?: string;
  internalStatusValue?: string;
}) {
  const [billingStatus, setBillingStatus] = useState(defaultBillingStatus);
  const isInternal = billingStatus === internalStatusValue;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Billing status">
        <SelectInput
          name="billingStatus"
          value={billingStatus}
          onChange={(event) => setBillingStatus(event.target.value)}
        >
          {billingStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectInput>
      </Field>
      {isInternal ? (
        <Field label="Interní kategorie">
          <SelectInput
            name="internalCategory"
            defaultValue={defaultInternalCategory}
          >
            <option value="">Vyberte kategorii</option>
            {internalCategories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </Field>
      ) : (
        <Field label="Právní oblast">
          <SelectInput name="legalArea" defaultValue={defaultLegalArea}>
            <option value="">Vyberte oblast</option>
            {legalAreas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </SelectInput>
        </Field>
      )}
    </div>
  );
}
