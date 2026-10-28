import { createWorkLog } from "@/app/actions/work-logs";
import { CascadingMatterSelect } from "@/components/cascading-matter-select";
import { Field, TextArea, TextInput } from "@/components/form-field";
import { WorkLogCategoryFields } from "@/components/work-log-category-fields";
import { Button } from "@/components/ui/button";
import { BillingStatus } from "@/generated/prisma/enums";
import {
  billingStatusLabels,
  internalTaskCategoryLabels,
  legalAreaOptions,
  options as labelOptions,
} from "@/lib/labels";
import type { WorkLogFormOptions } from "@/lib/work-logs/create-form.server";
import { todayDateInputValue } from "@/lib/work-logs/duplicate";

export type WorkLogCreatePrefill = {
  subjectId?: string;
  projectId?: string;
  caseId?: string;
  taskId?: string;
  hours?: string;
  hourlyRate?: string;
  billingStatus?: string;
  legalArea?: string;
  internalCategory?: string;
  description?: string;
};

const billingStatusChoices = [
  BillingStatus.BILLABLE,
  BillingStatus.INTERNAL_NON_BILLABLE,
];

// Formulář nového výkazu práce — dialog „Nový výkaz práce“ / „Duplikovat výkaz
// práce“ na /work-logs i „Vykázat práci k úkolu“ na úkolech. `returnTo`
// (interní cesta) určí, kam se po uložení vrátit (createWorkLog ji ověří).
export function WorkLogCreateForm({
  options,
  prefill,
  sourceWorkLogId,
  returnTo,
  submitLabel = "Vytvořit výkaz",
  formKey = "new",
}: {
  options: WorkLogFormOptions;
  prefill?: WorkLogCreatePrefill | null;
  sourceWorkLogId?: string;
  returnTo?: string;
  submitLabel?: string;
  formKey?: string;
}) {
  const timeIncrementHours = options.timeIncrementMinutes === 6 ? 0.1 : 0.25;
  return (
    // key: switching ?duplicate=a → b re-mounts the uncontrolled defaults.
    <form key={formKey} action={createWorkLog} className="grid gap-4">
      {sourceWorkLogId ? (
        <input type="hidden" name="sourceWorkLogId" value={sourceWorkLogId} />
      ) : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {/* Cascading subject → project → case → task. Choosing a project/case
          narrows the task list to only that matter's tasks. */}
      <CascadingMatterSelect
        subjects={options.subjects.map((subject) => ({
          id: subject.id,
          name: subject.ico ? `${subject.name}, IČO ${subject.ico}` : subject.name,
        }))}
        projects={options.projects}
        cases={options.cases.map((legalCase) => ({
          id: legalCase.id,
          name: legalCase.name,
          projectId: legalCase.projectId,
          projectName: legalCase.project.name,
        }))}
        tasks={options.tasks}
        includeTask
        subjectLabel="Subjekt"
        defaultSubjectId={prefill?.subjectId}
        defaultProjectId={prefill?.projectId}
        defaultCaseId={prefill?.caseId}
        defaultTaskId={prefill?.taskId}
      />
      <div
        className={
          options.canViewRates ? "grid gap-4 md:grid-cols-3" : "grid gap-4 md:grid-cols-2"
        }
      >
        <Field label="Datum práce">
          <TextInput
            name="workDate"
            type="date"
            defaultValue={todayDateInputValue()}
            required
          />
        </Field>
        <Field label="Hodiny">
          <TextInput
            name="hours"
            type="number"
            min="0"
            step={timeIncrementHours}
            required
            defaultValue={prefill?.hours}
          />
        </Field>
        {/* Rate is hidden during reporting for non-partners — it is derived
            from the case/project and they shouldn't see (or set) pricing. */}
        {options.canViewRates ? (
          <Field label="Sazba">
            <TextInput
              name="hourlyRate"
              type="number"
              min="0"
              step="0.01"
              defaultValue={prefill?.hourlyRate ?? ""}
            />
          </Field>
        ) : null}
      </div>
      {/* Interní hodiny nabízejí interní kategorie místo právní oblasti. */}
      <WorkLogCategoryFields
        billingStatusOptions={billingStatusChoices.map((status) => ({
          value: status,
          label: billingStatusLabels[status],
        }))}
        defaultBillingStatus={prefill?.billingStatus ?? BillingStatus.BILLABLE}
        defaultLegalArea={prefill?.legalArea ?? ""}
        defaultInternalCategory={prefill?.internalCategory ?? ""}
        legalAreas={legalAreaOptions}
        internalCategories={labelOptions.internalTaskCategories.map((category) => ({
          value: category,
          label: internalTaskCategoryLabels[category],
        }))}
      />
      <Field label="Popis práce">
        <TextArea name="description" defaultValue={prefill?.description ?? ""} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pendingLabel="Vytvářím…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
