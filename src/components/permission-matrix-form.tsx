"use client";

import { useActionState, useState } from "react";
import { Lock } from "lucide-react";

import {
  resetRolePermissions,
  saveRolePermissions,
  type PermissionFormState,
} from "@/app/actions/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";
import { UserRole } from "@/generated/prisma/enums";
import {
  EDITABLE_ROLES,
  PERMISSION_ROLES,
  editablePermissionDefs,
  permissionGroupDescriptions,
  permissionGroupLabels,
  permissionRoleLabels,
  permissionScopeLabels,
  type PermissionDef,
  type PermissionScope,
} from "@/lib/permission-catalog";
import type { PermissionValue } from "@/lib/permission-resolver";
import { cn } from "@/lib/utils";

const FORM_ID = "permission-matrix";
const ADMIN_LOCK_TITLE =
  "Administrátor má vždy všechna oprávnění – nelze ho omezit, aby se nikdo nemohl zamknout.";
const ADMIN_ONLY_TITLE = "Toto oprávnění může měnit jen administrátor.";

const initialState: PermissionFormState = { ok: false, version: 0 };

type RoleValues = Record<string, Record<string, PermissionValue>>;

function describeValue(value: PermissionValue) {
  if (typeof value === "boolean") {
    return value ? "Ano" : "Ne";
  }
  return permissionScopeLabels[value];
}

function StatusMessage({ state }: { state: PermissionFormState }) {
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

type MatrixValues = Record<string, PermissionValue>;

// The editable role × permission table. Its controls are plain controlled
// inputs NOT associated with any form: the save form submits hidden inputs
// derived from the same state (see MatrixEditor). React 19 resets a <form
// action> after every submit, and controls tied to it only through the `form`
// attribute would snap back to their initial DOM defaults (a select to its
// first option) while React state keeps the saved value. Each column header
// holds its own "Obnovit výchozí" form, so forms are never nested.
function MatrixTable({
  values,
  setValue,
  inactiveEntitlements,
  actorIsAdmin,
  resetAction,
}: {
  values: MatrixValues;
  setValue: (id: string, value: PermissionValue) => void;
  inactiveEntitlements: string[];
  actorIsAdmin: boolean;
  resetAction: (formData: FormData) => void;
}) {
  const defs = editablePermissionDefs();
  const groups: Array<PermissionDef["kind"]> = ["module", "scope", "function"];

  return (
    <div className="table-scroll rounded-lg border border-[#dce4e8]">
      <table className="w-max min-w-full">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 min-w-[16rem] max-w-[22rem] bg-[var(--iv-bg)] text-left"
            >
              Oprávnění
            </th>
            {PERMISSION_ROLES.map((role) => (
              <th
                key={role}
                scope="col"
                className="min-w-[9.5rem] text-center align-top"
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    {role === UserRole.ADMIN ? (
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : null}
                    {permissionRoleLabels[role]}
                  </span>
                  {role === UserRole.ADMIN ? (
                    <span className="text-[11px] font-normal text-[#566673]">
                      Vždy vše
                    </span>
                  ) : (
                    <form action={resetAction}>
                      <input type="hidden" name="role" value={role} />
                      <ConfirmDialogButton
                        label="Obnovit výchozí"
                        title="Obnovit výchozí oprávnění"
                        message={`Všechna oprávnění role ${permissionRoleLabels[role]} se vrátí na výchozí nastavení. Výjimky jednotlivých uživatelů zůstanou.`}
                        confirmLabel="Obnovit výchozí"
                        pendingLabel="Obnovuji…"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                      />
                    </form>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group) => {
          const groupDefs = defs.filter((def) => def.kind === group);
          return (
            <tbody key={group}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={PERMISSION_ROLES.length + 1}
                  className="bg-[#eef3f5] text-left"
                >
                  <span className="block text-sm font-semibold text-[#0e1822]">
                    {permissionGroupLabels[group]}
                  </span>
                  <span className="mt-0.5 block max-w-3xl text-xs font-normal leading-5 text-[#566673]">
                    {permissionGroupDescriptions[group]}
                  </span>
                </th>
              </tr>
              {groupDefs.map((def) => {
                const inactive =
                  def.kind === "module" &&
                  inactiveEntitlements.includes(def.entitlement);
                const lockedForActor =
                  def.kind === "function" && def.adminOnlyEdit && !actorIsAdmin;
                return (
                  <tr key={def.key}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 min-w-[16rem] max-w-[22rem] bg-white text-left align-top font-normal"
                    >
                      <span className="block text-sm font-semibold text-[#0e1822]">
                        {def.label}
                      </span>
                      <span className="mt-0.5 block whitespace-normal text-xs leading-5 text-[#566673]">
                        {def.description}
                        {def.kind === "scope" ? ` ${def.scopeHint}` : null}
                      </span>
                      {inactive ? (
                        <Badge tone="amber" className="mt-1">
                          Modul kanceláře není aktivní
                        </Badge>
                      ) : null}
                    </th>
                    {PERMISSION_ROLES.map((role) => {
                      const label = `${def.label} – ${permissionRoleLabels[role]}`;
                      if (role === UserRole.ADMIN) {
                        return (
                          <td
                            key={role}
                            className="text-center align-middle"
                            title={ADMIN_LOCK_TITLE}
                          >
                            {def.kind === "scope" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[#566673]">
                                <Lock className="h-3 w-3" aria-hidden="true" />
                                {permissionScopeLabels.ALL}
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked
                                disabled
                                readOnly
                                aria-label={label}
                                className="h-4 w-4 rounded border-stone-300"
                              />
                            )}
                          </td>
                        );
                      }

                      const id = `${role}:${def.key}`;
                      const value = values[id];
                      const defaultValue = def.defaults[role];
                      const modified = value !== defaultValue;
                      const marker = modified ? (
                        <span
                          className="ml-1 text-xs text-[#0f7f7f]"
                          title={`Výchozí: ${describeValue(defaultValue)}`}
                        >
                          <span aria-hidden="true">●</span>
                          <span className="sr-only">
                            {` upraveno, výchozí: ${describeValue(defaultValue)}`}
                          </span>
                        </span>
                      ) : null;

                      if (def.kind === "scope") {
                        return (
                          <td key={role} className="text-center align-middle">
                            <span className="inline-flex items-center">
                              <select
                                aria-label={`Rozsah dat ${label}`}
                                value={value as PermissionScope}
                                onChange={(event) =>
                                  setValue(
                                    id,
                                    event.target.value as PermissionScope,
                                  )
                                }
                                className="h-9 rounded-md border border-[#c9d5db] bg-white px-2 text-sm text-[#0e1822] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#17A2A2]"
                              >
                                {def.options.map((option) => (
                                  <option key={option} value={option}>
                                    {permissionScopeLabels[option]}
                                  </option>
                                ))}
                              </select>
                              {marker}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={role}
                          className="text-center align-middle"
                          title={lockedForActor ? ADMIN_ONLY_TITLE : undefined}
                        >
                          <span className="inline-flex items-center">
                            <input
                              type="checkbox"
                              aria-label={label}
                              checked={value === true}
                              disabled={lockedForActor}
                              onChange={(event) =>
                                setValue(id, event.target.checked)
                              }
                              className={cn(
                                "h-4 w-4 rounded border-stone-300 text-emerald-950",
                                lockedForActor && "cursor-not-allowed",
                              )}
                            />
                            {marker}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

// Owns the edited values. Re-mounted (key) whenever the saved matrix changes,
// so after a save or reset the table shows what the server stored; a failed
// save keeps the unsaved edits.
function MatrixEditor({
  roleValues,
  inactiveEntitlements,
  actorIsAdmin,
  saveAction,
  resetAction,
}: {
  roleValues: RoleValues;
  inactiveEntitlements: string[];
  actorIsAdmin: boolean;
  saveAction: (formData: FormData) => void;
  resetAction: (formData: FormData) => void;
}) {
  const defs = editablePermissionDefs();
  const [values, setValues] = useState<MatrixValues>(() => {
    const initial: MatrixValues = {};
    for (const role of EDITABLE_ROLES) {
      for (const def of defs) {
        initial[`${role}:${def.key}`] =
          roleValues[role]?.[def.key] ?? def.defaults[role];
      }
    }
    return initial;
  });

  function setValue(id: string, value: PermissionValue) {
    setValues((previous) => ({ ...previous, [id]: value }));
  }

  return (
    <>
      <MatrixTable
        values={values}
        setValue={setValue}
        inactiveEntitlements={inactiveEntitlements}
        actorIsAdmin={actorIsAdmin}
        resetAction={resetAction}
      />
      <form
        id={FORM_ID}
        action={saveAction}
        className="flex flex-wrap items-center gap-3"
      >
        {defs.map((def) => (
          <input key={def.key} type="hidden" name="keys" value={def.key} />
        ))}
        {/* Checkbox semantics: present = ALLOW, absent = not allowed. */}
        {Object.entries(values).map(([id, value]) =>
          value === false ? null : (
            <input
              key={id}
              type="hidden"
              name={id}
              value={value === true ? "ALLOW" : value}
            />
          ),
        )}
        <Button type="submit" pendingLabel="Ukládám…">
          Uložit oprávnění
        </Button>
        <span className="text-xs text-[#566673]">
          Změny platí pro všechny uživatele dané role hned po uložení.
        </span>
      </form>
    </>
  );
}

export function PermissionMatrixForm({
  roleValues,
  inactiveEntitlements,
  actorIsAdmin,
}: {
  roleValues: RoleValues;
  inactiveEntitlements: string[];
  actorIsAdmin: boolean;
}) {
  const [saveState, saveAction] = useActionState(
    saveRolePermissions,
    initialState,
  );
  const [resetState, resetAction] = useActionState(
    resetRolePermissions,
    initialState,
  );
  const latest =
    resetState.version > saveState.version ? resetState : saveState;

  return (
    <div className="grid gap-4">
      <StatusMessage state={latest} />
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#566673]">
        <span>
          <span aria-hidden="true" className="text-[#0f7f7f]">
            ●
          </span>{" "}
          upraveno oproti výchozímu nastavení
        </span>
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Administrátor má vždy všechna oprávnění
        </span>
      </p>
      <MatrixEditor
        key={JSON.stringify(roleValues)}
        roleValues={roleValues}
        inactiveEntitlements={inactiveEntitlements}
        actorIsAdmin={actorIsAdmin}
        saveAction={saveAction}
        resetAction={resetAction}
      />
    </div>
  );
}
