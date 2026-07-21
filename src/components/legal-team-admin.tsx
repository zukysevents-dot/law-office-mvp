import {
  assignLegalTeamMember,
  createLegalTeam,
  removeLegalTeamMember,
} from "@/app/actions/legal-teams";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type Team = {
  id: string;
  name: string;
  members: Array<{
    id: string;
    user: { id: string; name: string; email: string };
  }>;
};

export function LegalTeamAdmin({
  organizationId,
  teams,
  users,
}: {
  organizationId: string;
  teams: Team[];
  users: Array<{ id: string; name: string; email: string }>;
}) {
  return (
    <Section title="Právní týmy">
      <div className="grid gap-4 lg:grid-cols-2">
        <form action={createLegalTeam} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="organizationId" value={organizationId} />
          <Field label="Nový tým">
            <TextInput name="name" placeholder="Např. Korporátní právo" required />
          </Field>
          <Button type="submit">Vytvořit tým</Button>
        </form>
        {teams.length > 0 && users.length > 0 ? (
          <form action={assignLegalTeamMember} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="organizationId" value={organizationId} />
            <Field label="Uživatel">
              <SelectInput name="userId" required>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Tým">
              <SelectInput name="legalTeamId" required>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Button type="submit" variant="secondary">
              Přiřadit
            </Button>
          </form>
        ) : null}
      </div>
      {teams.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <article key={team.id} className="rounded-lg border border-[#d4e2dc] p-4">
              <h3 className="font-semibold text-[#072924]">{team.name}</h3>
              {team.members.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {team.members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{member.user.name}</span>
                        <span className="block truncate text-xs text-stone-500">{member.user.email}</span>
                      </span>
                      <form action={removeLegalTeamMember}>
                        <input type="hidden" name="organizationId" value={organizationId} />
                        <input type="hidden" name="membershipId" value={member.id} />
                        <Button type="submit" variant="ghost" className="h-8 px-3">
                          Odebrat
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-stone-500">Bez členů.</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5"><EmptyState>Zatím není vytvořen žádný právní tým.</EmptyState></div>
      )}
    </Section>
  );
}
