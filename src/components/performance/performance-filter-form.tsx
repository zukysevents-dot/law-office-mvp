import { Field, SelectInput } from "@/components/form-field";
import { PeriodFields } from "@/components/performance/period-fields";
import { Button, ButtonLink } from "@/components/ui/button";
import type { UserRole } from "@/generated/prisma/enums";
import { userRoleLabels } from "@/lib/labels";
import type { PerformanceFilters } from "@/lib/performance/filters";
import { NO_TEAM } from "@/lib/performance/metrics";
import type { PerformancePeriod } from "@/lib/performance/period";

const ROLE_ORDER: UserRole[] = ["ADMIN", "PARTNER", "LAWYER", "TRAINEE", "INTERN"];

// GET filtr stránky Výkonnost (navigace → progress bar z balíku 01). Řazení
// se přenáší skrytými poli.
export function PerformanceFilterForm({
  formKey,
  period,
  filters,
  teams,
  roles,
  people,
}: {
  formKey: string;
  period: PerformancePeriod;
  filters: PerformanceFilters;
  teams: Array<{ id: string; name: string }>;
  roles: UserRole[];
  people: Array<{ id: string; name: string }>;
}) {
  const roleOptions = ROLE_ORDER.filter((role) => roles.includes(role));
  return (
    <form key={formKey} className="grid gap-4" action="/performance">
      {filters.sort !== "name" ? <input type="hidden" name="sort" value={filters.sort} /> : null}
      {filters.dir !== "asc" ? <input type="hidden" name="dir" value={filters.dir} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <PeriodFields
          kind={period.kind}
          from={period.fromIso}
          to={period.toIso}
          anchor={period.params.anchor}
        />
        <Field label="Tým">
          <SelectInput name="teamId" defaultValue={filters.teamId ?? ""}>
            <option value="">Všechny týmy</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
            <option value={NO_TEAM}>Bez týmu</option>
          </SelectInput>
        </Field>
        <Field label="Role">
          <SelectInput name="role" defaultValue={filters.role ?? ""}>
            <option value="">Všechny role</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {userRoleLabels[role]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Osoba">
          <SelectInput name="userId" defaultValue={filters.userId ?? ""}>
            <option value="">Všichni zaměstnanci</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary">
          Použít filtry
        </Button>
        <ButtonLink href="/performance" variant="ghost">
          Zrušit filtry
        </ButtonLink>
      </div>
    </form>
  );
}
