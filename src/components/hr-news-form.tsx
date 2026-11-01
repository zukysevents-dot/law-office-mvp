"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createHrNews,
  updateHrNews,
  type HrNewsFormState,
} from "@/app/actions/hr-news";
import { Field, TextArea, TextInput } from "@/components/form-field";
import { FormResult } from "@/components/form-result";
import { Button, ButtonLink } from "@/components/ui/button";
import { NEWS_BODY_MAX, NEWS_TITLE_MAX } from "@/lib/hr/news";

export type HrNewsFormValues = {
  id?: string;
  title: string;
  body: string;
  audience: "ALL" | "ROLES" | "USERS";
  roles: string[];
  recipientIds: string[];
  pinned: boolean;
  visibleUntil: string; // YYYY-MM-DD nebo ""
};

const emptyValues: HrNewsFormValues = {
  title: "",
  body: "",
  audience: "ALL",
  roles: [],
  recipientIds: [],
  pinned: false,
  visibleUntil: "",
};

const initialState: HrNewsFormState = { ok: false, version: 0 };

const checkboxClass =
  "h-4 w-4 rounded border-[#dce4e8] text-[#0e1822] focus:ring-[#17A2A2]";

// Formulář aktuality (nová i úprava). Pole jsou kontrolovaná: React 19 by jinak
// po odeslání formulář vyprázdnil i při chybě validace.
export function HrNewsForm({
  initial,
  roleOptions,
  memberOptions,
}: {
  initial?: HrNewsFormValues;
  roleOptions: Array<{ value: string; label: string }>;
  memberOptions: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const [values, setValues] = useState<HrNewsFormValues>(initial ?? emptyValues);
  const [state, formAction] = useActionState(
    async (previous: HrNewsFormState, formData: FormData) => {
      const next = isEdit
        ? await updateHrNews(previous, formData)
        : await createHrNews(previous, formData);
      if (next.ok) {
        if (isEdit) {
          router.push("/hr/news");
        } else {
          setValues(emptyValues);
        }
      }
      return next;
    },
    initialState,
  );

  function update<K extends keyof HrNewsFormValues>(key: K, value: HrNewsFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function toggle(key: "roles" | "recipientIds", value: string, checked: boolean) {
    setValues((current) => ({
      ...current,
      [key]: checked
        ? [...current[key], value]
        : current[key].filter((item) => item !== value),
    }));
  }

  return (
    // key: React 19 po odeslání resetuje formulář a u radií/checkboxů vrátí
    // výchozí `checked` i přes kontrolovaný stav — nový mount podle verze
    // výsledku vykreslí pole znovu z uloženého stavu.
    <form
      key={state.version}
      action={formAction}
      className="grid gap-4 sm:max-w-3xl"
      data-testid="hr-news-form"
    >
      {initial?.id ? <input type="hidden" name="newsId" value={initial.id} /> : null}
      <Field label="Nadpis">
        <TextInput
          name="title"
          required
          maxLength={NEWS_TITLE_MAX}
          placeholder="Např. Vítáme nového kolegu / Ve čtvrtek nepůjde elektřina"
          value={values.title}
          onChange={(event) => update("title", event.target.value)}
        />
      </Field>
      <Field label="Text">
        <TextArea
          name="body"
          required
          maxLength={NEWS_BODY_MAX}
          rows={6}
          value={values.body}
          onChange={(event) => update("body", event.target.value)}
        />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-[#0e1822]">Pro koho</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#0e1822]">
          {(
            [
              ["ALL", "Celá kancelář"],
              ["ROLES", "Vybrané role"],
              ["USERS", "Konkrétní kolegové"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                value={value}
                checked={values.audience === value}
                onChange={() => update("audience", value)}
                className={checkboxClass}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {values.audience === "ROLES" ? (
          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-[#dce4e8] bg-[#F4F7F8]/55 p-3 text-sm">
            {roleOptions.map((role) => (
              <label key={role.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="audienceRoles"
                  value={role.value}
                  checked={values.roles.includes(role.value)}
                  onChange={(event) => toggle("roles", role.value, event.target.checked)}
                  className={checkboxClass}
                />
                <span>{role.label}</span>
              </label>
            ))}
          </div>
        ) : null}

        {values.audience === "USERS" ? (
          <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border border-[#dce4e8] bg-[#F4F7F8]/55 p-3 text-sm sm:grid-cols-2">
            {memberOptions.map((member) => (
              <label key={member.id} className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  name="recipientIds"
                  value={member.id}
                  checked={values.recipientIds.includes(member.id)}
                  onChange={(event) =>
                    toggle("recipientIds", member.id, event.target.checked)
                  }
                  className={checkboxClass}
                />
                <span className="truncate">{member.name}</span>
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Zobrazovat na dashboardu do (volitelné)">
          <TextInput
            type="date"
            name="visibleUntil"
            value={values.visibleUntil}
            onChange={(event) => update("visibleUntil", event.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-[#0e1822]">
          <input
            type="checkbox"
            name="pinned"
            checked={values.pinned}
            onChange={(event) => update("pinned", event.target.checked)}
            className={checkboxClass}
          />
          <span>Připnout nahoru</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" pendingLabel={isEdit ? "Ukládám…" : "Zveřejňuji…"}>
          {isEdit ? "Uložit změny" : "Zveřejnit aktualitu"}
        </Button>
        {isEdit ? (
          <ButtonLink href="/hr/news" variant="ghost">
            Zrušit úpravu
          </ButtonLink>
        ) : null}
      </div>
      <FormResult state={state} />
    </form>
  );
}
