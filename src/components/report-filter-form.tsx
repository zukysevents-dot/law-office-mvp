import { Field, SelectInput, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { legalAreaOptions } from "@/lib/labels";
import type { ReportFilterOptions } from "@/lib/reporting/options";
import type { ReportFilters } from "@/lib/reporting/filters";

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
          <SelectInput name="subjectId" defaultValue={filters.subjectId}>
            <option value="">Všechny subjekty</option>
            {options.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
                {subject.ico ? `, IČO ${subject.ico}` : ""}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Projekt">
          <SelectInput name="projectId" defaultValue={filters.projectId}>
            <option value="">Všechny projekty</option>
            {options.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Případ">
          <SelectInput name="caseId" defaultValue={filters.caseId}>
            <option value="">Všechny případy</option>
            {options.cases.map((legalCase) => (
              <option key={legalCase.id} value={legalCase.id}>
                {legalCase.name} / {legalCase.project.name}
              </option>
            ))}
          </SelectInput>
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
