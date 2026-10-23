"use client";

import { useActionState, useState, type ReactNode } from "react";

import {
  resetUserPermissionOverrides,
  saveUserPermissionOverrides,
  type PermissionFormState,
} from "@/app/actions/permissions";
import { Button } from "@/components/ui/button";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";
import {
  editablePermissionDefs,
  permissionGroupLabels,
  permissionScopeLabels,
  type PermissionDef,
  type PermissionScope,
} from "@/lib/permission-catalog";
import type { PermissionValue } from "@/lib/permission-resolver";
import { permissionOverrideLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

const initialState: PermissionFormState = { ok: false, version: 0 };
const INHERIT = "INHERIT";
const ADMIN_ONLY_TITLE = "Toto oprávnění může měnit jen administrátor.";

function describeValue(value: PermissionValue) {
  if (typeof value === "boolean") {
    return value ? "Ano" : "Ne";
  }
  return permissionScopeLabels[value];
}

function effectiveValue(
  def: PermissionDef,
  override: string,
  roleValue: PermissionValue,
): PermissionValue {
  if (override === INHERIT) {
    return roleValue;
  }
  if (def.kind === "scope") {
    return override as PermissionScope;
  }
  return override === "ALLOW";
}

function Status({ state }: { state: PermissionFormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      >
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p
        role="status"
        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
      >
        {state.message}
      </p>
    );
  }
  return null;
}

// Controls are plain controlled inputs without a form owner; the save form
// submits hidden inputs built from the same state. React 19 resets a <form
// action> after every submit, which would snap controls tied to it through the
// `form` attribute back to their initial DOM defaults while state keeps the
// saved value (see permission-matrix-form.tsx).
function OverrideRows({
  userId,
  roleValues,
  overrides,
  actorIsAdmin,
  saveAction,
  resetSlot,
}: {
  userId: string;
  roleValues: Record<string, PermissionValue>;
  overrides: Record<string, string>;
  actorIsAdmin: boolean;
  saveAction: (formData: FormData) => void;
  resetSlot: ReactNode;
}) {
  const defs = editablePermissionDefs();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      defs.map((def) => [def.key, overrides[def.key] ?? INHERIT]),
    ),
  );
  const groups: Array<PermissionDef["kind"]> = ["module", "scope", "function"];

  return (
    <>
      <div className="table-scroll rounded-lg border border-[#dce4e8]">
        <table className="w-max min-w-full">
          <thead>
            <tr>
              <th scope="col" className="text-left">
                Oprávnění
              </th>
              <th scope="col" className="text-left">
                Nastavení
              </th>
              <th scope="col" className="text-left">
                Výsledek
              </th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={3}
                  className="bg-[#eef3f5] text-left"
                >
                  {permissionGroupLabels[group]}
                </th>
              </tr>
              {defs
                .filter((def) => def.kind === group)
                .map((def) => {
                  const value = values[def.key];
                  const roleValue = roleValues[def.key];
                  const effective = effectiveValue(def, value, roleValue);
                  const locked =
                    def.kind === "function" &&
                    def.adminOnlyEdit &&
                    !actorIsAdmin;
                  const inheritLabel = `${permissionOverrideLabels.INHERIT} (${describeValue(roleValue)})`;
                  const set = (next: string) =>
                    setValues((previous) => ({ ...previous, [def.key]: next }));

                  return (
                    <tr key={def.key}>
                      <th
                        scope="row"
                        className="min-w-[14rem] max-w-[22rem] bg-white text-left align-top font-normal"
                      >
                        <span className="block text-sm font-semibold text-[#0e1822]">
                          {def.label}
                        </span>
                        <span className="mt-0.5 block whitespace-normal text-xs leading-5 text-[#566673]">
                          {def.description}
                        </span>
                      </th>
                      <td
                        className="align-middle"
                        title={locked ? ADMIN_ONLY_TITLE : undefined}
                      >
                        {def.kind === "scope" ? (
                          <select
                            aria-label={`Rozsah dat ${def.label}`}
                            value={value}
                            onChange={(event) => set(event.target.value)}
                            className="h-9 rounded-md border border-[#c9d5db] bg-white px-2 text-sm text-[#0e1822] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#17A2A2]"
                          >
                            <option value={INHERIT}>{inheritLabel}</option>
                            {def.options.map((option) => (
                              <option key={option} value={option}>
                                {permissionScopeLabels[option]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <fieldset
                            className="flex flex-wrap gap-x-4 gap-y-1"
                            disabled={locked}
                          >
                            <legend className="sr-only">{def.label}</legend>
                            {[
                              { value: INHERIT, label: inheritLabel },
                              {
                                value: "ALLOW",
                                label: permissionOverrideLabels.ALLOW,
                              },
                              {
                                value: "DENY",
                                label: permissionOverrideLabels.DENY,
                              },
                            ].map((option) => (
                              <label
                                key={option.value}
                                className={cn(
                                  "inline-flex items-center gap-1.5 text-sm text-[#0e1822]",
                                  locked && "cursor-not-allowed opacity-60",
                                )}
                              >
                                <input
                                  type="radio"
                                  name={`override-${def.key}`}
                                  value={option.value}
                                  checked={value === option.value}
                                  onChange={() => set(option.value)}
                                  className="h-4 w-4 border-stone-300 text-emerald-950"
                                />
                                {option.label}
                              </label>
                            ))}
                          </fieldset>
                        )}
                      </td>
                      <td className="align-middle text-sm">
                        <span
                          className={cn(
                            "font-medium",
                            value !== INHERIT
                              ? "text-[#0f7f7f]"
                              : "text-[#0e1822]",
                          )}
                        >
                          {describeValue(effective)}
                        </span>
                        {value !== INHERIT ? (
                          <span className="block text-xs text-[#566673]">
                            výjimka
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          ))}
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <form id="user-permission-overrides" action={saveAction}>
          <input type="hidden" name="userId" value={userId} />
          {defs.map((def) => (
            <input key={def.key} type="hidden" name="keys" value={def.key} />
          ))}
          {defs.map((def) => (
            <input
              key={`value-${def.key}`}
              type="hidden"
              name={def.key}
              value={values[def.key]}
            />
          ))}
          <Button type="submit" pendingLabel="Ukládám…">
            Uložit výjimky
          </Button>
        </form>
        {resetSlot}
      </div>
    </>
  );
}

export function UserPermissionOverridesForm({
  userId,
  userName,
  roleValues,
  overrides,
  actorIsAdmin,
}: {
  userId: string;
  userName: string;
  roleValues: Record<string, PermissionValue>;
  overrides: Record<string, string>;
  actorIsAdmin: boolean;
}) {
  const [saveState, saveAction] = useActionState(
    saveUserPermissionOverrides,
    initialState,
  );
  const [resetState, resetAction] = useActionState(
    resetUserPermissionOverrides,
    initialState,
  );
  const latest =
    resetState.version > saveState.version ? resetState : saveState;

  return (
    <div className="grid gap-4">
      <Status state={latest} />
      {/* Re-mount when the stored overrides change (save / reset). */}
      <OverrideRows
        key={JSON.stringify(overrides)}
        userId={userId}
        roleValues={roleValues}
        overrides={overrides}
        actorIsAdmin={actorIsAdmin}
        saveAction={saveAction}
        resetSlot={
          <form action={resetAction}>
            <input type="hidden" name="userId" value={userId} />
            <ConfirmDialogButton
              label="Zrušit všechny výjimky"
              title="Zrušit všechny výjimky"
              message={`Všechny výjimky uživatele ${userName} se zruší a bude mít oprávnění podle své role.`}
              confirmLabel="Zrušit výjimky"
              cancelLabel="Ponechat"
              pendingLabel="Ruším…"
              variant="ghost"
            />
          </form>
        }
      />
    </div>
  );
}
