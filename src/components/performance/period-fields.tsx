"use client";

import { useState } from "react";

import { Field, SelectInput, TextInput } from "@/components/form-field";
import { performancePeriodLabels } from "@/lib/labels";
import type { PerformancePeriodKind } from "@/lib/performance/period";

const KINDS: PerformancePeriodKind[] = ["week", "month", "quarter", "custom"];

// Období + Od/Do. Vyplnění Od/Do přepne na „Vlastní“, výběr jiného období
// pole Od/Do vyprázdní — formulář tak nikdy nepošle protichůdné hodnoty.
export function PeriodFields({
  kind,
  from,
  to,
}: {
  kind: PerformancePeriodKind;
  from: string;
  to: string;
}) {
  const [period, setPeriod] = useState<PerformancePeriodKind>(kind);
  const [range, setRange] = useState(
    kind === "custom" ? { from, to } : { from: "", to: "" },
  );

  function changeRange(key: "from" | "to", value: string) {
    setRange((current) => ({ ...current, [key]: value }));
    if (value) {
      setPeriod("custom");
    }
  }

  return (
    <>
      <Field label="Období">
        <SelectInput
          name="period"
          value={period}
          onChange={(event) => {
            const next = event.target.value as PerformancePeriodKind;
            setPeriod(next);
            if (next !== "custom") {
              setRange({ from: "", to: "" });
            }
          }}
        >
          {KINDS.map((option) => (
            <option key={option} value={option}>
              {performancePeriodLabels[option]}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Od">
        <TextInput
          name="from"
          type="date"
          value={range.from}
          onChange={(event) => changeRange("from", event.target.value)}
        />
      </Field>
      <Field label="Do">
        <TextInput
          name="to"
          type="date"
          value={range.to}
          onChange={(event) => changeRange("to", event.target.value)}
        />
      </Field>
    </>
  );
}
