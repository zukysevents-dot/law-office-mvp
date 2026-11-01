import { Search } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { BulkAssignmentTable } from "@/components/bulk-assignment-table";
import { Field, SelectInput, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { TeamManager } from "@/components/team-manager";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import {
  getTeamOptions,
  loadAssignmentOverview,
  readOverviewFilters,
} from "@/lib/assignments-overview.server";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { getOrgUserOptions } from "@/lib/org-users";
import { getLegalTeamAdminData } from "@/lib/organization";
import {
  canBulkAssign,
  canManageTeams,
  canOpenAssignments,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AssignmentsPageProps = {
  searchParams: Promise<{
    q?: string;
    show?: string;
    team?: string;
    user?: string;
    state?: string;
  }>;
};

// Týmy a řešitelé: jedno místo pro právní týmy a pro to, kdo řeší které
// projekty a případy (filtr + hromadné přiřazení/odebrání).
export default async function AssignmentsPage({
  searchParams,
}: AssignmentsPageProps) {
  const currentUser = await getCurrentUser();
  if (!canOpenAssignments(currentUser)) {
    return (
      <AccessDenied
        title="Týmy a řešitelé"
        message="Týmy a řešitelé jsou dostupné uživatelům s oprávněním „Spravuje nastavení kanceláře“ nebo „Upravuje všechny projekty, případy a úkoly“."
      />
    );
  }
  const manageTeams = canManageTeams(currentUser);
  const bulkAssign = canBulkAssign(currentUser);
  const filters = readOverviewFilters(await searchParams);
  const hasFilters =
    Boolean(filters.q || filters.teamId || filters.userId) ||
    filters.show !== "all" ||
    filters.state !== "all";

  const result = await safeQuery(
    {
      teamAdmin: null as Awaited<ReturnType<typeof getLegalTeamAdminData>> | null,
      overview: { rows: [], truncated: false } as Awaited<
        ReturnType<typeof loadAssignmentOverview>
      >,
      teams: [] as Awaited<ReturnType<typeof getTeamOptions>>,
      users: [] as Array<{ id: string; name: string }>,
    },
    async () => {
      const prisma = getPrisma();
      const [teamAdmin, overview, teams, users] = await Promise.all([
        manageTeams ? getLegalTeamAdminData(currentUser.organizationId) : null,
        bulkAssign
          ? loadAssignmentOverview(prisma, currentUser, filters)
          : { rows: [], truncated: false },
        getTeamOptions(prisma, currentUser.organizationId),
        getOrgUserOptions(currentUser),
      ]);
      return { teamAdmin, overview, teams, users };
    },
  );
  const { teamAdmin, overview, teams, users } = result.data;

  return (
    <>
      <PageHeader
        title="Týmy a řešitelé"
        description="Na jednom místě nastavíte právní týmy a kdo řeší které projekty a případy. Členové týmu vidí vše, k čemu je tým přiřazen."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {manageTeams && teamAdmin ? (
        <TeamManager
          teams={teamAdmin.teams}
          archivedTeams={teamAdmin.archivedTeams}
          users={teamAdmin.users}
        />
      ) : null}

      {bulkAssign ? (
        <Section
          title="Řešitelé projektů a případů"
          id="resitele"
          className="scroll-mt-6"
        >
          <p className="mb-4 text-sm text-stone-600">
            Zaškrtněte projekty nebo případy a přiřaďte jim tým nebo osobu.
            Řešitelé projektu vidí i všechny jeho případy. Odpovědnou osobu
            měníte v úpravě projektu nebo případu.
          </p>
          <form
            className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6"
            action="/settings/assignments"
          >
            <Field label="Hledat" className="xl:col-span-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-stone-600"
                  aria-hidden="true"
                />
                <TextInput
                  name="q"
                  defaultValue={filters.q}
                  placeholder="Název, klient nebo spisová značka"
                  className="pl-9"
                />
              </div>
            </Field>
            <Field label="Zobrazit">
              <SelectInput name="show" defaultValue={filters.show}>
                <option value="all">Projekty i případy</option>
                <option value="projects">Jen projekty</option>
                <option value="cases">Jen případy</option>
              </SelectInput>
            </Field>
            <Field label="Tým">
              <SelectInput name="team" defaultValue={filters.teamId}>
                <option value="">Všechny týmy</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Osoba">
              <SelectInput name="user" defaultValue={filters.userId}>
                <option value="">Kdokoli</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Přiřazení">
              <SelectInput name="state" defaultValue={filters.state}>
                <option value="all">Vše</option>
                <option value="none">Bez řešitelů</option>
                <option value="some">S řešiteli</option>
              </SelectInput>
            </Field>
            <div className="flex flex-wrap items-end gap-2 xl:col-span-6">
              <Button type="submit" variant="secondary">
                Filtrovat
              </Button>
              {hasFilters ? (
                <ButtonLink href="/settings/assignments#resitele" variant="ghost">
                  Zrušit filtry
                </ButtonLink>
              ) : null}
            </div>
          </form>
          <BulkAssignmentTable
            // Nový filtr = nové řádky; výběr z minulého filtru se zahodí.
            key={JSON.stringify(filters)}
            rows={overview.rows}
            teams={teams}
            users={users}
            truncated={overview.truncated}
          />
        </Section>
      ) : null}
    </>
  );
}
