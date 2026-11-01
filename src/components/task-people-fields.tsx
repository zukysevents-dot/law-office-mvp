"use client";

import { useRef, useState } from "react";
import { Star, UserPlus, X } from "lucide-react";

import { chipClass, removeButtonClass } from "@/components/assignee-chip-styles";
import { Field, SelectInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { countLabel } from "@/lib/plural";

type Person = { id: string; name: string };

export type TaskPeopleTeamOption = {
  id: string;
  name: string;
  memberCount: number;
  memberIds: string[];
};

const MEMBER_ACCUSATIVE = ["člena", "členy", "členů"] as const;

export const TASK_PEOPLE_HELP =
  "Řešitelé na úkolu pracují a mohou ho upravovat. Osoba s dohledem úkol vidí, může ho komentovat a měnit jeho status a dostává upozornění na změny statusu, komentáře a překročení termínu. Úkol upravovat nemůže a není za něj odpovědná.";

// Řešitelé (více osob, první = hlavní), dohled a odpovědná osoba na formuláři
// úkolu (nový úkol i úprava). Tým se při výběru rozbalí na své aktivní členy
// (tým samotný se k úkolu neukládá). Odesílá skrytá pole assigneeIds
// (opakovaně, hlavní první), supervisorIds a primaryAssigneeId; odpovědná
// osoba zůstává select „responsibleUserId“. Server data normalizuje znovu
// (normalizeTaskPeople), tady jde jen o pohodlné ovládání.
export function TaskPeopleFields({
  users,
  teams,
  defaultAssigneeIds = [],
  defaultSupervisorIds = [],
  defaultResponsibleUserId = "",
  responsibleEmptyLabel = "Bez přiřazení",
}: {
  users: Person[];
  teams: TaskPeopleTeamOption[];
  defaultAssigneeIds?: string[];
  defaultSupervisorIds?: string[];
  defaultResponsibleUserId?: string;
  responsibleEmptyLabel?: string;
}) {
  const userById = new Map(users.map((user) => [user.id, user]));
  const known = (ids: string[]) => ids.filter((id) => userById.has(id));

  const [assigneeIds, setAssigneeIds] = useState<string[]>(() =>
    known([...new Set(defaultAssigneeIds)]),
  );
  const [supervisorIds, setSupervisorIds] = useState<string[]>(() => {
    const taken = new Set(defaultAssigneeIds);
    return known([...new Set(defaultSupervisorIds)]).filter(
      (id) => !taken.has(id) && id !== defaultResponsibleUserId,
    );
  });
  const [responsibleUserId, setResponsibleUserId] = useState(
    defaultResponsibleUserId,
  );
  const [assigneePick, setAssigneePick] = useState("");
  const [supervisorPick, setSupervisorPick] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const assigneeSelect = useRef<HTMLSelectElement>(null);
  const supervisorSelect = useRef<HTMLSelectElement>(null);

  const nameOf = (id: string) => userById.get(id)?.name ?? id;
  const assigneeSet = new Set(assigneeIds);
  const supervisorSet = new Set(supervisorIds);

  // --- Řešitelé ---------------------------------------------------------
  const assigneeCandidates = users.filter((user) => !assigneeSet.has(user.id));
  const assigneeTeams = teams.filter((team) =>
    team.memberIds.some((id) => userById.has(id) && !assigneeSet.has(id)),
  );

  function addAssignees(ids: string[], message: string) {
    const fresh = ids.filter((id) => userById.has(id) && !assigneeSet.has(id));
    if (fresh.length === 0) {
      setAnnouncement("Všichni vybraní už jsou řešiteli.");
      return;
    }
    setAssigneeIds([...assigneeIds, ...fresh]);
    // Řešitel má přednost před dohledem.
    setSupervisorIds(supervisorIds.filter((id) => !fresh.includes(id)));
    setAnnouncement(message);
  }

  function handleAddAssignee() {
    const [kind, id] = assigneePick.split(":");
    if (kind === "user" && id) {
      addAssignees([id], `Přidán řešitel ${nameOf(id)}.`);
    } else if (kind === "team" && id) {
      const team = teams.find((item) => item.id === id);
      if (team) {
        addAssignees(team.memberIds, `Přidáni členové týmu ${team.name}.`);
      }
    }
    setAssigneePick("");
    assigneeSelect.current?.focus();
  }

  function removeAssignee(id: string) {
    setAssigneeIds(assigneeIds.filter((item) => item !== id));
    setAnnouncement(`Odebrán řešitel ${nameOf(id)}.`);
  }

  function makePrimary(id: string) {
    setAssigneeIds([id, ...assigneeIds.filter((item) => item !== id)]);
    setAnnouncement(`Hlavní řešitel: ${nameOf(id)}.`);
  }

  // --- Dohled -------------------------------------------------------------
  const blockedForSupervisor = (id: string) =>
    assigneeSet.has(id) || supervisorSet.has(id) || id === responsibleUserId;
  const supervisorCandidates = users.filter(
    (user) => !blockedForSupervisor(user.id),
  );
  const supervisorTeams = teams.filter((team) =>
    team.memberIds.some((id) => userById.has(id) && !blockedForSupervisor(id)),
  );

  function addSupervisors(ids: string[], message: string) {
    const fresh = ids.filter(
      (id) => userById.has(id) && !blockedForSupervisor(id),
    );
    if (fresh.length === 0) {
      setAnnouncement("Všichni vybraní už na úkolu jsou.");
      return;
    }
    setSupervisorIds([...supervisorIds, ...fresh]);
    setAnnouncement(message);
  }

  function handleAddSupervisor() {
    const [kind, id] = supervisorPick.split(":");
    if (kind === "user" && id) {
      addSupervisors([id], `Přidán dohled ${nameOf(id)}.`);
    } else if (kind === "team" && id) {
      const team = teams.find((item) => item.id === id);
      if (team) {
        addSupervisors(team.memberIds, `Přidáni členové týmu ${team.name} jako dohled.`);
      }
    }
    setSupervisorPick("");
    supervisorSelect.current?.focus();
  }

  function removeSupervisor(id: string) {
    setSupervisorIds(supervisorIds.filter((item) => item !== id));
    setAnnouncement(`Odebrán dohled ${nameOf(id)}.`);
  }

  function changeResponsible(id: string) {
    setResponsibleUserId(id);
    // Odpovědná osoba nemůže být zároveň dohledem.
    if (id && supervisorSet.has(id)) {
      setSupervisorIds(supervisorIds.filter((item) => item !== id));
    }
  }

  const teamLabel = (team: TaskPeopleTeamOption, blocked: (id: string) => boolean) => {
    const addable = team.memberIds.filter(
      (id) => userById.has(id) && !blocked(id),
    ).length;
    return `${team.name} – přidá ${countLabel(addable, MEMBER_ACCUSATIVE)}`;
  };

  return (
    <div className="grid gap-4">
      {assigneeIds.map((id) => (
        <input key={`a-${id}`} type="hidden" name="assigneeIds" value={id} />
      ))}
      {supervisorIds.map((id) => (
        <input key={`s-${id}`} type="hidden" name="supervisorIds" value={id} />
      ))}
      <input type="hidden" name="primaryAssigneeId" value={assigneeIds[0] ?? ""} />

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="grid min-w-0 content-start gap-2">
          <legend className="mb-1.5 text-sm font-medium text-[#0e1822]">
            Řešitelé
          </legend>
          {assigneeIds.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Vybraní řešitelé">
              {assigneeIds.map((id, index) => (
                <li key={id} className={chipClass}>
                  <span className="font-medium text-[#0e1822]">{nameOf(id)}</span>
                  {index === 0 ? (
                    <span className="rounded bg-[#17A2A2]/20 px-1.5 py-0.5 text-xs font-medium text-[#0e1822]">
                      hlavní
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makePrimary(id)}
                      aria-label={`Nastavit ${nameOf(id)} jako hlavního řešitele`}
                      title="Nastavit jako hlavního"
                      className={removeButtonClass.replace(
                        "hover:bg-red-50 hover:text-red-700",
                        "hover:bg-[#17A2A2]/20 hover:text-[#0e1822]",
                      )}
                    >
                      <Star className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAssignee(id)}
                    aria-label={`Odebrat řešitele ${nameOf(id)}`}
                    className={removeButtonClass}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-600">Zatím bez řešitele.</p>
          )}
          {assigneeCandidates.length > 0 || assigneeTeams.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <SelectInput
                ref={assigneeSelect}
                aria-label="Přidat řešitele nebo tým"
                value={assigneePick}
                onChange={(event) => setAssigneePick(event.target.value)}
                className="min-w-0"
              >
                <option value="">Vyberte osobu nebo tým</option>
                {assigneeCandidates.length > 0 ? (
                  <optgroup label="Osoby">
                    {assigneeCandidates.map((user) => (
                      <option key={user.id} value={`user:${user.id}`}>
                        {user.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {assigneeTeams.length > 0 ? (
                  <optgroup label="Týmy (přidá všechny členy)">
                    {assigneeTeams.map((team) => (
                      <option key={team.id} value={`team:${team.id}`}>
                        {teamLabel(team, (id) => assigneeSet.has(id))}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </SelectInput>
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddAssignee}
                disabled={!assigneePick}
                aria-label="Přidat řešitele"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Přidat
              </Button>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="grid min-w-0 content-start gap-2">
          <legend className="mb-1.5 text-sm font-medium text-[#0e1822]">
            Dohled
          </legend>
          {supervisorIds.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Vybraný dohled">
              {supervisorIds.map((id) => (
                <li key={id} className={chipClass}>
                  <span className="font-medium text-[#0e1822]">{nameOf(id)}</span>
                  <button
                    type="button"
                    onClick={() => removeSupervisor(id)}
                    aria-label={`Odebrat dohled ${nameOf(id)}`}
                    className={removeButtonClass}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-600">Bez dohledu.</p>
          )}
          {supervisorCandidates.length > 0 || supervisorTeams.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <SelectInput
                ref={supervisorSelect}
                aria-label="Přidat osobu s dohledem"
                value={supervisorPick}
                onChange={(event) => setSupervisorPick(event.target.value)}
                className="min-w-0"
              >
                <option value="">Vyberte osobu nebo tým</option>
                {supervisorCandidates.length > 0 ? (
                  <optgroup label="Osoby">
                    {supervisorCandidates.map((user) => (
                      <option key={user.id} value={`user:${user.id}`}>
                        {user.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {supervisorTeams.length > 0 ? (
                  <optgroup label="Týmy (přidá všechny členy)">
                    {supervisorTeams.map((team) => (
                      <option key={team.id} value={`team:${team.id}`}>
                        {teamLabel(team, blockedForSupervisor)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </SelectInput>
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddSupervisor}
                disabled={!supervisorPick}
                aria-label="Přidat dohled"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Přidat
              </Button>
            </div>
          ) : null}
        </fieldset>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Odpovědná osoba">
          <SelectInput
            name="responsibleUserId"
            value={responsibleUserId}
            onChange={(event) => changeResponsible(event.target.value)}
          >
            <option value="">{responsibleEmptyLabel}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <p className="self-end text-sm text-stone-600">{TASK_PEOPLE_HELP}</p>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
