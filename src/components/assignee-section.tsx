import Link from "next/link";
import { UserPlus, UsersRound, X } from "lucide-react";

import { Field, SelectInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { countLabel } from "@/lib/plural";

type PersonAssignee = { id: string; user: { id: string; name: string } };

export type AssignedTeam = {
  // Id řádku přiřazení (pro odebrání).
  id: string;
  legalTeam: {
    id: string;
    name: string;
    members: Array<{ user: { id: string; name: string } }>;
  };
};

export type TeamCandidate = { id: string; name: string; memberCount: number };

export type InheritedAssignees = {
  responsibleName: string | null;
  people: string[];
  teams: Array<{ name: string; members: string[] }>;
};

const MEMBER_FORMS = ["člen", "členové", "členů"] as const;

const removeButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e1822]";

const chipClass =
  "flex items-center gap-2 rounded-md border border-[#dce4e8] bg-[#F4F7F8]/55 px-3 py-1.5 text-sm";

function memberNames(team: AssignedTeam["legalTeam"]) {
  return team.members.map((member) => member.user.name).join(", ");
}

function inheritedSummary(inherited: InheritedAssignees) {
  return [
    ...(inherited.responsibleName
      ? [`odpovědný ${inherited.responsibleName}`]
      : []),
    ...inherited.teams.map((team) =>
      team.members.length > 0
        ? `Tým ${team.name} (${team.members.join(", ")})`
        : `Tým ${team.name}`,
    ),
    ...inherited.people,
  ];
}

// Sekce „Řešitelé“ na detailu projektu i případu: přiřazené týmy (s jejich
// členy) a osoby, u případu i řešitelé zdědění z projektu. Přidání jedním
// polem (optgroup Týmy / Osoby), odebrání tlačítkem × u chipu. Akce jsou
// server actions s okamžitým překreslením (balík 01).
export function AssigneeSection({
  title,
  kind,
  parentId,
  assignees,
  teams,
  inherited,
  candidates,
  teamCandidates,
  addAction,
  removeUserAction,
  removeTeamAction,
  canEdit,
  manageHref,
}: {
  title: string;
  kind: "project" | "case";
  parentId: string;
  assignees: PersonAssignee[];
  teams: AssignedTeam[];
  inherited?: InheritedAssignees | null;
  candidates: Array<{ id: string; name: string }>;
  teamCandidates: TeamCandidate[];
  addAction: (formData: FormData) => Promise<void>;
  removeUserAction: (formData: FormData) => Promise<void>;
  removeTeamAction: (formData: FormData) => Promise<void>;
  canEdit: boolean;
  manageHref?: string | null;
}) {
  const assignedUserIds = new Set(assignees.map((assignee) => assignee.user.id));
  const assignedTeamIds = new Set(teams.map((team) => team.legalTeam.id));
  const availablePeople = candidates.filter(
    (candidate) => !assignedUserIds.has(candidate.id),
  );
  const availableTeams = teamCandidates.filter(
    (team) => !assignedTeamIds.has(team.id),
  );
  const inheritedItems = inherited ? inheritedSummary(inherited) : [];
  const isEmpty = assignees.length === 0 && teams.length === 0;

  return (
    <Section title={title}>
      <p className="mb-3 text-sm text-stone-600">
        {kind === "project"
          ? "Řešitelé a členové přiřazených týmů vidí projekt, všechny jeho případy, úkoly a klienta a mohou na něj vykazovat práci. Nový člen týmu získá přístup automaticky."
          : "Řešitelé a členové přiřazených týmů vidí tento případ, jeho úkoly a klienta a mohou na něj vykazovat práci. Nový člen týmu získá přístup automaticky."}
      </p>

      {isEmpty ? (
        <EmptyState>Zatím bez řešitelů.</EmptyState>
      ) : (
        <div className="grid gap-4">
          {teams.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-stone-500">
                Týmy
              </h3>
              <ul className="flex flex-wrap gap-2">
                {teams.map((assignment) => (
                  <li key={assignment.id} className={`${chipClass} items-start`}>
                    <UsersRound
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#0f7f7f]"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-[#0e1822]">
                        Tým {assignment.legalTeam.name}
                      </span>
                      <span className="block text-xs text-stone-600">
                        {assignment.legalTeam.members.length > 0
                          ? memberNames(assignment.legalTeam)
                          : "Tým zatím nemá členy."}
                      </span>
                    </span>
                    {canEdit ? (
                      <form action={removeTeamAction}>
                        <input type="hidden" name="id" value={assignment.id} />
                        <SubmitButton
                          replaceChildrenWhilePending
                          aria-label={`Odebrat tým ${assignment.legalTeam.name}`}
                          className={removeButtonClass}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {assignees.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-stone-500">
                Osoby
              </h3>
              <ul className="flex flex-wrap gap-2">
                {assignees.map((assignee) => (
                  <li key={assignee.id} className={chipClass}>
                    <span className="font-medium text-[#0e1822]">
                      {assignee.user.name}
                    </span>
                    {canEdit ? (
                      <form action={removeUserAction}>
                        <input type="hidden" name="id" value={assignee.id} />
                        <SubmitButton
                          replaceChildrenWhilePending
                          aria-label={`Odebrat řešitele ${assignee.user.name}`}
                          className={removeButtonClass}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {inheritedItems.length > 0 ? (
        <p className="mt-3 text-sm text-stone-600">
          <span className="font-medium text-[#2c3a45]">
            Z projektu (vidí případ díky přiřazení k projektu):
          </span>{" "}
          {inheritedItems.join(", ")}
        </p>
      ) : null}

      {canEdit && (availablePeople.length > 0 || availableTeams.length > 0) ? (
        <form
          action={addAction}
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <input
            type="hidden"
            name={kind === "project" ? "projectId" : "caseId"}
            value={parentId}
          />
          <Field label="Přidat řešitele nebo tým">
            <SelectInput name="assignee" required defaultValue="">
              <option value="">Vyberte tým nebo osobu</option>
              {availableTeams.length > 0 ? (
                <optgroup label="Týmy">
                  {availableTeams.map((team) => (
                    <option key={team.id} value={`team:${team.id}`}>
                      {team.name} ({countLabel(team.memberCount, MEMBER_FORMS)})
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {availablePeople.length > 0 ? (
                <optgroup label="Osoby">
                  {availablePeople.map((candidate) => (
                    <option key={candidate.id} value={`user:${candidate.id}`}>
                      {candidate.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </SelectInput>
          </Field>
          <Button
            type="submit"
            variant="secondary"
            className="self-end"
            pendingLabel="Přidávám…"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Přidat
          </Button>
        </form>
      ) : null}

      {manageHref ? (
        <p className="mt-3 text-sm">
          <Link
            href={manageHref}
            className="font-medium text-emerald-950 underline-offset-2 hover:underline"
          >
            Spravovat řešitele hromadně
          </Link>
        </p>
      ) : null}
    </Section>
  );
}
