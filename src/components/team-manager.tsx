import Link from "next/link";
import { UsersRound } from "lucide-react";

import {
  archiveLegalTeam,
  assignLegalTeamMember,
  removeLegalTeamMember,
  restoreLegalTeam,
} from "@/app/actions/legal-teams";
import { Field, SelectInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { TeamCreateForm } from "@/components/team-create-form";
import { TeamRenameDialog } from "@/components/team-rename-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialogButton } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { countLabel, czechPlural } from "@/lib/plural";

type TeamMemberRow = {
  id: string;
  user: { id: string; name: string; email: string };
};

export type ManagedTeam = {
  id: string;
  name: string;
  members: TeamMemberRow[];
  _count: { projectAssignments: number; caseAssignments: number };
};

export type ArchivedTeam = {
  id: string;
  name: string;
  _count: { members: number };
};

export type TeamUserOption = {
  id: string;
  name: string;
  email: string;
  currentTeamId: string | null;
  currentTeamName: string | null;
};

const MEMBER_FORMS = ["člen", "členové", "členů"] as const;

function assignmentSummary(team: ManagedTeam) {
  const projects = team._count.projectAssignments;
  const cases = team._count.caseAssignments;
  if (projects + cases === 0) {
    return "Zatím není přiřazen k žádnému projektu ani případu";
  }
  return `Přiřazen k ${projects} ${czechPlural(projects, ["projektu", "projektům", "projektům"])} a ${cases} ${czechPlural(cases, ["případu", "případům", "případům"])}`;
}

// Správa právních týmů na stránce Týmy a řešitelé: založení, členové (přidat /
// odebrat), přejmenování, archivace a obnovení. Akce překreslí stránku hned.
export function TeamManager({
  teams,
  archivedTeams,
  users,
}: {
  teams: ManagedTeam[];
  archivedTeams: ArchivedTeam[];
  users: TeamUserOption[];
}) {
  return (
    <Section title="Týmy" id="tymy" className="scroll-mt-6">
      <p className="mb-4 text-sm text-stone-600">
        Každý člen kanceláře může být v jednom týmu. Přidáním do jiného týmu se
        přesune. Členové týmu vidí vše, k čemu je tým přiřazen.
      </p>
      <TeamCreateForm />

      {teams.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const headingId = `team-${team.id}`;
            const candidates = users.filter(
              (user) => user.currentTeamId !== team.id,
            );
            return (
              <article
                key={team.id}
                aria-labelledby={headingId}
                className="flex min-w-0 flex-col gap-3 rounded-lg border border-[#d4e2dc] p-4"
              >
                <div className="flex items-start gap-2">
                  <UsersRound
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#0f7f7f]"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <h3
                      id={headingId}
                      className="break-words font-semibold text-[#072924]"
                    >
                      {team.name}
                    </h3>
                    <p className="text-xs text-stone-600">
                      {countLabel(team.members.length, MEMBER_FORMS)} ·{" "}
                      <Link
                        href={`/settings/assignments?team=${team.id}#resitele`}
                        className="text-emerald-950 underline-offset-2 hover:underline"
                      >
                        {assignmentSummary(team)}
                      </Link>
                    </p>
                  </div>
                </div>

                {team.members.length > 0 ? (
                  <ul className="grid gap-2">
                    {team.members.map((member) => (
                      <li
                        key={member.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {member.user.name}
                          </span>
                          <span className="block truncate text-xs text-stone-500">
                            {member.user.email}
                          </span>
                        </span>
                        <form action={removeLegalTeamMember}>
                          <input type="hidden" name="membershipId" value={member.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            className="h-8 px-3"
                            pendingLabel="Odebírám…"
                            aria-label={`Odebrat ${member.user.name} z týmu ${team.name}`}
                          >
                            Odebrat
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-stone-500">Tým zatím nemá členy.</p>
                )}

                {candidates.length > 0 ? (
                  <form
                    action={assignLegalTeamMember}
                    className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
                  >
                    <input type="hidden" name="legalTeamId" value={team.id} />
                    <Field label={`Přidat člena do týmu ${team.name}`}>
                      <SelectInput name="userId" required defaultValue="">
                        <option value="">Vyberte člena kanceláře</option>
                        {candidates.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                            {user.currentTeamName
                              ? ` – nyní v týmu ${user.currentTeamName}`
                              : ""}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Button
                      type="submit"
                      variant="secondary"
                      pendingLabel="Přidávám…"
                    >
                      Přidat
                    </Button>
                  </form>
                ) : null}

                <div className="mt-auto flex flex-wrap gap-2 border-t border-[#e6eef0] pt-3">
                  <TeamRenameDialog legalTeamId={team.id} currentName={team.name} />
                  <form action={archiveLegalTeam}>
                    <input type="hidden" name="legalTeamId" value={team.id} />
                    <ConfirmDialogButton
                      label="Archivovat tým"
                      title={`Archivovat tým ${team.name}?`}
                      message="Členové týmu ztratí přístup k projektům a případům přiřazeným přes tento tým, pokud ho nemají jinak. Tým můžete později obnovit."
                      pendingLabel="Archivuji…"
                      className="h-8 px-3"
                    />
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState>Zatím není vytvořen žádný právní tým.</EmptyState>
        </div>
      )}

      {archivedTeams.length > 0 ? (
        <details className="mt-5 rounded-lg border border-[#e6eef0] p-3">
          <summary className="cursor-pointer text-sm font-medium text-[#0e1822]">
            Archivované týmy ({archivedTeams.length})
          </summary>
          <ul className="mt-3 grid gap-2">
            {archivedTeams.map((team) => (
              <li
                key={team.id}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span>
                  <span className="font-medium">{team.name}</span>{" "}
                  <span className="text-xs text-stone-500">
                    ({countLabel(team._count.members, MEMBER_FORMS)})
                  </span>
                </span>
                <form action={restoreLegalTeam}>
                  <input type="hidden" name="legalTeamId" value={team.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    className="h-8 px-3"
                    pendingLabel="Obnovuji…"
                    aria-label={`Obnovit tým ${team.name}`}
                  >
                    Obnovit
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Section>
  );
}
