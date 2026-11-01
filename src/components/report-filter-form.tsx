import { Field, SelectInput, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { legalAreaOptions } from "@/lib/labels";
import type { ReportFilterOptions } from "@/lib/reporting/options";
import type { ReportFilters } from "@/lib/reporting/filters";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { namedSelectOption, subjectSelectOption } from "@/lib/searchable-select";

// Shared GET filter form for every report view. Submits to the current page,
// preserving the selection via the report querystring.
export function ReportFilterForm({
  filters,
  options,
}: {
  filters: ReportFilters;
  options: ReportFilterOptions;
}) {
  return (
    <form className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Subjekt">
          <SearchableSelect
            name="subjectId"
            defaultValue={filters.subjectId}
            placeholder="Všechny subjekty"
            options={options.subjects.map(subjectSelectOption)}
          />
        </Field>
        <Field label="Projekt">
          <SearchableSelect
            name="projectId"
            defaultValue={filters.projectId}
            placeholder="Všechny projekty"
            options={options.projects.map(namedSelectOption)}
          />
        </Field>
        <Field label="Případ">
          <SearchableSelect
            name="caseId"
            defaultValue={filters.caseId}
            placeholder="Všechny případy"
            options={options.cases.map((legalCase) => ({
              value: legalCase.id,
              label: `${legalCase.name} / ${legalCase.project.name}`,
            }))}
          />
        </Field>
        <Field label="Pracovník">
          <SelectInput name="userId" defaultValue={filters.userId}>
            <option value="">Všichni pracovníci</option>
            {options.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Právní oblast">
          <SelectInput name="legalArea" defaultValue={filters.legalArea}>
            <option value="">Všechny oblasti</option>
            {legalAreaOptions.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Datum od">
          <TextInput name="dateFrom" type="date" defaultValue={filters.dateFrom} />
        </Field>
        <Field label="Datum do">
          <TextInput name="dateTo" type="date" defaultValue={filters.dateTo} />
        </Field>
      </div>
      <div>
        <Button type="submit" variant="secondary">
          Filtrovat
        </Button>
      </div>
    </form>
  );
}
