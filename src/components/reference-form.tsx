import { createReference } from "@/app/actions/references";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { legalAreaOptions } from "@/lib/labels";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { namedSelectOption, subjectSelectOption } from "@/lib/searchable-select";

type Option = {
  id: string;
  name: string;
};

export function ReferenceForm({
  returnTo,
  fixedProjectId,
  fixedCaseId,
  fixedSubjectId,
  projects = [],
  cases = [],
  subjects = [],
}: {
  returnTo: string;
  fixedProjectId?: string;
  fixedCaseId?: string;
  fixedSubjectId?: string;
  projects?: Option[];
  cases?: Array<Option & { project?: { name: string } }>;
  subjects?: Array<Option & { ico?: string | null }>;
}) {
  return (
    <form action={createReference} className="grid gap-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      {fixedProjectId ? (
        <input type="hidden" name="projectId" value={fixedProjectId} />
      ) : null}
      {fixedCaseId ? <input type="hidden" name="caseId" value={fixedCaseId} /> : null}
      {fixedSubjectId ? (
        <input type="hidden" name="subjectId" value={fixedSubjectId} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Název reference">
          <TextInput name="title" required />
        </Field>
        <Field label="Právní odvětví">
          <SelectInput name="legalArea" defaultValue="">
            <option value="">Vyberte odvětví</option>
            {legalAreaOptions.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
      {!fixedProjectId || !fixedCaseId || !fixedSubjectId ? (
        <div className="grid gap-4 md:grid-cols-3">
          {!fixedProjectId ? (
            <Field label="Projekt">
              <SearchableSelect
                name="projectId"
                placeholder="Bez projektu"
                options={projects.map(namedSelectOption)}
              />
            </Field>
          ) : null}
          {!fixedCaseId ? (
            <Field label="Případ">
              <SearchableSelect
                name="caseId"
                placeholder="Bez případu"
                options={cases.map((legalCase) => ({
                  value: legalCase.id,
                  label: legalCase.project
                    ? `${legalCase.name} / ${legalCase.project.name}`
                    : legalCase.name,
                }))}
              />
            </Field>
          ) : null}
          {!fixedSubjectId ? (
            <Field label="Subjekt">
              <SearchableSelect
                name="subjectId"
                placeholder="Bez subjektu"
                options={subjects.map(subjectSelectOption)}
              />
            </Field>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Hodnota v Kč">
          <TextInput name="valueCzk" type="number" min="0" step="0.01" />
        </Field>
        <Field label="Začátek období">
          <TextInput name="startDate" type="date" />
        </Field>
        <Field label="Konec období">
          <TextInput name="endDate" type="date" />
        </Field>
      </div>
      <Field label="Popis reference">
        <TextArea name="description" />
      </Field>
      <div>
        <Button type="submit" pendingLabel="Ukládám…">Uložit referenci</Button>
      </div>
    </form>
  );
}
