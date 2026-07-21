"use client";

import { useState } from "react";

import { Field, SelectInput } from "@/components/form-field";
import { BillingStatus } from "@/generated/prisma/enums";
import { billingStatusLabels } from "@/lib/labels";

type Props = {
  // Full billing-status choice (incl. "Fakturovatelné") only for ADMIN/PARTNER/
  // LAWYER; everyone else is limited to needs-approval / internal.
  billingStatuses: BillingStatus[];
  legalAreas: string[];
  internalActivities: string[];
  defaultBillingStatus?: BillingStatus;
  defaultArea?: string;
};

// Billing status + activity classification for a work log. When the log is
// marked INTERNAL, the "area" dropdown swaps from legal areas to internal
// activity categories — internal firm work isn't legal work on a matter.
export function WorkLogClassification({
  billingStatuses,
  legalAreas,
  internalActivities,
  defaultBillingStatus,
  defaultArea,
}: Props) {
  const initial =
    defaultBillingStatus && billingStatuses.includes(defaultBillingStatus)
      ? defaultBillingStatus
      : billingStatuses[0];
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(initial);

  const isInternal = billingStatus === BillingStatus.INTERNAL_NON_BILLABLE;
  const areaOptions = isInternal ? internalActivities : legalAreas;
  const areaLabel = isInternal ? "Interní úkon" : "Právní oblast";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Billing status">
        <SelectInput
          name="billingStatus"
          value={billingStatus}
          onChange={(event) =>
            setBillingStatus(event.target.value as BillingStatus)
          }
        >
          {billingStatuses.map((status) => (
            <option key={status} value={status}>
              {billingStatusLabels[status]}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label={areaLabel}>
        {/* key forces a fresh mount so defaultValue resets when the set swaps */}
        <SelectInput
          key={isInternal ? "internal" : "legal"}
          name="legalArea"
          defaultValue={
            defaultArea && areaOptions.includes(defaultArea) ? defaultArea : ""
          }
        >
          <option value="">Vyberte oblast</option>
          {areaOptions.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </SelectInput>
      </Field>
    </div>
  );
}
