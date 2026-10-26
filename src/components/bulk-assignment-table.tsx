"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { UsersRound } from "lucide-react";

import {
  bulkUpdateAssignments,
  type BulkAssignState,
} from "@/app/actions/matter-assignments";
import { FormResult } from "@/components/form-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { AssignmentRow, AssignmentRowTeam } from "@/lib/assignments";

const initialState: BulkAssignState = { ok: false, version: 0 };

const selectClass =
  "h-10 w-full rounded-md border border-[#dce4e8] bg-white px-3 text-sm shadow-sm outline-none transition focus:border-[#0e1822] focus:ring-2 focus:ring-[#0e1822]/20";

function TeamChip({ team, muted }: { team: AssignmentRowTeam; muted?: boolean }) {
  return (
    <span
      className={
        muted
          ? "inline-flex items-center gap-1 rounded-md border border-dashed border-[#dce4e8] px-2 py-0.5 text-xs text-stone-500"
          : "inline-flex items-center gap-1 rounded-md border border-[#17A2A2]/60 bg-[#17A2A2]/10 px-2 py-0.5 text-xs font-medium text-[#0e1822]"
      }
      title={
        team.members.length > 0
          ? `Členové: ${team.members.join(", ")}`
          : "Tým zatím nemá členy."
      }
    >
      <UsersRound className="h-3 w-3" aria-hidden="true" />
      Tým {team.name}
    </span>
  );
}

function AssigneesCell({ row }: { row: AssignmentRow }) {
  const hasOwn = row.teams.length > 0 || row.people.length > 0;
  const hasInherited =
    row.inheritedTeams.length > 0 || row.inheritedPeople.length > 0;
  if (!hasOwn && !hasInherited) {
    return <span className="text-stone-500">Bez řešitelů</span>;
  }
  return (
    <div className="flex max-w-md flex-wrap gap-1">
      {row.teams.map((team) => (
        <TeamChip key={`t-${team.name}`} team={team} />
      ))}
      {row.people.map((name) => (
        <span
          key={`p-${name}`}
          className="inline-flex items-center rounded-md border border-[#dce4e8] bg-[#F4F7F8] px-2 py-0.5 text-xs"
        >
          {name}
        </span>
      ))}
      {hasInherited ? (
        <span className="flex w-full flex-wrap items-center gap-1 text-xs text-stone-500">
          z projektu:
          {row.inheritedTeams.map((team) => (
            <TeamChip key={`it-${team.name}`} team={team} muted />
          ))}
          {row.inheritedPeople.length > 0 ? (
            <span>{row.inheritedPeople.join(", ")}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

// Tabulka „Řešitelé projektů a případů“ s hromadným přiřazením/odebráním.
// Výběr řádků i zvolený řešitel žijí v React state a odesílají se přes hidden
// inputy: React 19 po odeslání <form action> resetuje nekontrolované prvky.
export function BulkAssignmentTable({
  rows,
  teams,
  users,
  truncated,
}: {
  rows: AssignmentRow[];
  teams: Array<{ id: string; name: string; memberCount: number }>;
  users: Array<{ id: string; name: string }>;
  truncated: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [assignee, setAssignee] = useState("");
  const [state, formAction] = useActionState(
    async (previous: BulkAssignState, formData: FormData) => {
      const next = await bulkUpdateAssignments(previous, formData);
      if (next.ok) {
        setSelected(new Set());
      }
      return next;
    },
    initialState,
  );

  const editableKeys = useMemo(
    () => rows.filter((row) => row.editable).map((row) => row.key),
    [rows],
  );
  // Vybrané jen z aktuálně zobrazených řádků (po změně filtru).
  const visibleSelected = editableKeys.filter((key) => selected.has(key));
  const allSelected =
    editableKeys.length > 0 && visibleSelected.length === editableKeys.length;
  const count = visibleSelected.length;

  function toggle(key: string, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(editableKeys) : new Set());
  }

  const assigneeLabel = (() => {
    if (assignee.startsWith("team:")) {
      const team = teams.find((option) => `team:${option.id}` === assignee);
      return team ? `tým ${team.name}` : "vybraného řešitele";
    }
    const user = users.find((option) => `user:${option.id}` === assignee);
    return user ? user.name : "vybraného řešitele";
  })();

  return (
    <div className="grid gap-4">
      <form
        action={formAction}
        className="grid gap-3 rounded-lg border border-[#dce4e8] bg-[#F4F7F8]/60 p-3"
        aria-label="Hromadné přiřazení řešitelů"
      >
        {visibleSelected.map((key) => (
          <input key={key} type="hidden" name="target" value={key} />
        ))}
        <input type="hidden" name="assignee" value={assignee} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex h-10 items-center gap-2 text-sm font-medium text-[#0e1822]">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allSelected}
              disabled={editableKeys.length === 0}
              onChange={(event) => toggleAll(event.target.checked)}
            />
            Vybrat vše
          </label>
          <p className="flex h-10 items-center text-sm text-[#2c3a45]" aria-live="polite">
            Vybráno: {count}
          </p>
          <label className="grid min-w-[14rem] flex-1 gap-1.5 text-sm font-medium text-[#0e1822]">
            <span>Řešitel</span>
            <select
              className={selectClass}
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
            >
              <option value="">Vyberte tým nebo osobu</option>
              {teams.length > 0 ? (
                <optgroup label="Týmy">
                  {teams.map((team) => (
                    <option key={team.id} value={`team:${team.id}`}>
                      {team.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {users.length > 0 ? (
                <optgroup label="Osoby">
                  {users.map((user) => (
                    <option key={user.id} value={`user:${user.id}`}>
                      {user.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
          <Button
            type="submit"
            name="mode"
            value="assign"
            pendingLabel="Ukládám…"
            disabled={count === 0 || !assignee}
          >
            Přiřadit vybraným
          </Button>
          <ConfirmDialogButton
            label="Odebrat vybraným"
            title="Odebrat řešitele"
            message={`Odebrat ${assigneeLabel} z ${count} vybraných záznamů? Odpovědnou osobu tím neměníte.`}
            confirmLabel="Odebrat"
            confirmName="mode"
            confirmValue="unassign"
            pendingLabel="Odebírám…"
            variant="ghost"
            disabled={count === 0 || !assignee}
          />
        </div>
        {count === 0 || !assignee ? (
          <p className="text-xs text-stone-600">
            Zaškrtněte projekty nebo případy v tabulce a zvolte tým nebo osobu.
          </p>
        ) : null}
        <FormResult state={state} />
      </form>

      {truncated ? (
        <p className="text-sm text-amber-900">
          Zobrazeno prvních 300 záznamů. Zpřesněte filtr.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-scroll">
          <table className="w-max min-w-full">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Výběr</span>
                </th>
                <th scope="col">Typ</th>
                <th scope="col">Klient</th>
                <th scope="col">Název</th>
                <th scope="col">Odpovědný</th>
                <th scope="col">Řešitelé</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      aria-label={`Vybrat ${row.title}`}
                      checked={selected.has(row.key)}
                      disabled={!row.editable}
                      title={
                        row.editable ? undefined : "Tento záznam nemůžete upravit."
                      }
                      onChange={(event) => toggle(row.key, event.target.checked)}
                    />
                  </td>
                  <td>
                    <Badge tone={row.kind === "project" ? "blue" : "purple"}>
                      {row.kind === "project" ? "Projekt" : "Případ"}
                    </Badge>
                  </td>
                  <td>{row.clientName}</td>
                  <td className="max-w-xs">
                    <Link
                      href={row.href}
                      className="font-medium text-emerald-950 hover:underline"
                    >
                      {row.projectName ? (
                        <>
                          <span className="font-normal text-stone-600">
                            {row.projectName} ›{" "}
                          </span>
                          {row.title}
                        </>
                      ) : (
                        row.title
                      )}
                    </Link>
                  </td>
                  <td>{row.responsibleName ?? "—"}</td>
                  <td>
                    <AssigneesCell row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>Filtru neodpovídá žádný projekt ani případ.</EmptyState>
      )}
    </div>
  );
}
