"use client";

import { useActionState, useState } from "react";

import {
  updateUserHoursPlan,
  type HoursPlanFormState,
} from "@/app/actions/users";
import { Field, TextInput } from "@/components/form-field";
import { FormResult } from "@/components/form-result";
import { Button } from "@/components/ui/button";
import type { HoursPlanTargets } from "@/lib/hours-plan";

const initialState: HoursPlanFormState = { ok: false, version: 0 };

const FIELDS = [
  { name: "weeklyHoursTarget", key: "weeklyTotal", label: "Týdně celkem (h)" },
  {
    name: "weeklyBillableHoursTarget",
    key: "weeklyBillable",
    label: "Týdně fakturovatelné (h)",
  },
  { name: "monthlyHoursTarget", key: "monthlyTotal", label: "Měsíčně celkem (h)" },
  {
    name: "monthlyBillableHoursTarget",
    key: "monthlyBillable",
    label: "Měsíčně fakturovatelné (h)",
  },
] as const satisfies ReadonlyArray<{
  name: string;
  key: keyof HoursPlanTargets;
  label: string;
}>;

type Values = Record<keyof HoursPlanTargets, string>;

function toValues(plan: HoursPlanTargets): Values {
  return {
    weeklyTotal: plan.weeklyTotal != null ? String(plan.weeklyTotal) : "",
    weeklyBillable: plan.weeklyBillable != null ? String(plan.weeklyBillable) : "",
    monthlyTotal: plan.monthlyTotal != null ? String(plan.monthlyTotal) : "",
    monthlyBillable: plan.monthlyBillable != null ? String(plan.monthlyBillable) : "",
  };
}

// Plán hodin jednoho pracovníka (KPI celkem i fakturovatelné). Pole jsou
// kontrolovaná: React 19 by jinak po odeslání formulář vyprázdnil i při chybě
// validace a uživatel by přišel o zadané hodnoty. Výsledek se ukáže pod řádkem
// hned po uložení (server action jen revaliduje, bez redirectu).
export function HoursPlanForm({
  userId,
  userName,
  roleLabel,
  initial,
}: {
  userId: string;
  userName: string;
  roleLabel: string;
  initial: HoursPlanTargets;
}) {
  const [values, setValues] = useState<Values>(() => toValues(initial));
  const [state, formAction] = useActionState(updateUserHoursPlan, initialState);

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-md border border-stone-200 p-3"
      aria-label={`Plán hodin: ${userName}`}
      data-hours-plan-user={userName}
    >
      <input type="hidden" name="userId" value={userId} />
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,8rem))_auto]">
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <p className="truncate text-sm font-medium text-stone-950">{userName}</p>
          <p className="truncate text-xs text-stone-500">{roleLabel}</p>
        </div>
        {FIELDS.map((field) => (
          <Field key={field.name} label={field.label}>
            <TextInput
              name={field.name}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={values[field.key]}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
            />
          </Field>
        ))}
        <Button
          type="submit"
          variant="secondary"
          className="self-end"
          pendingLabel="Ukládám…"
        >
          Uložit
        </Button>
      </div>
      <FormResult state={state} />
    </form>
  );
}
