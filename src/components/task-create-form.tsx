import { createTask } from "@/app/actions/tasks";
import { CascadingMatterSelect } from "@/components/cascading-matter-select";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { TaskPeopleFields } from "@/components/task-people-fields";
import { Button, ButtonLink } from "@/components/ui/button";
import { pragueTodayIso } from "@/lib/deadlines";
import {
  options,
  taskDeadlineTypeLabels,
  taskPriorityLabels,
} from "@/lib/labels";
import type { TaskDuplicatePrefill } from "@/lib/tasks/duplicate";
import type { TaskFormOptions } from "@/lib/tasks/task-form-options.server";

// Formulář nového úkolu — inline sekce „Nový úkol“ na /tasks a stránka
// /tasks/new (i „Duplikovat úkol“ s předvyplněním). Názvy polí odpovídají
// akci createTask; při duplikaci se posílá i sourceTaskId.
export function TaskCreateForm({
  options: formOptions,
  currentUserId,
  prefill,
  sourceTaskId,
  defaultProjectId = "",
  defaultCaseId = "",
  submitLabel = "Vytvořit úkol",
  cancelHref,
}: {
  options: TaskFormOptions;
  currentUserId: string;
  prefill?: TaskDuplicatePrefill | null;
  sourceTaskId?: string;
  defaultProjectId?: string;
  defaultCaseId?: string;
  submitLabel?: string;
  cancelHref?: string;
}) {
  const { users, teams, subjects, projects, cases } = formOptions;
  return (
    // key: přepnutí ?duplicate=a → b znovu namontuje neřízené výchozí hodnoty.
    <form key={sourceTaskId || "new"} action={createTask} className="grid gap-4">
      {sourceTaskId ? (
        <input type="hidden" name="sourceTaskId" value={sourceTaskId} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Název úkolu" className="md:col-span-2">
          <TextInput name="title" required defaultValue={prefill?.title ?? ""} />
        </Field>
        <Field label="Priorita">
          <SelectInput name="priority" defaultValue={prefill?.priority ?? "STANDARD"}>
            {options.taskPriorities.map((priorityItem) => (
              <option key={priorityItem} value={priorityItem}>
                {taskPriorityLabels[priorityItem]}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
      <TaskPeopleFields
        users={users}
        teams={teams}
        defaultAssigneeIds={prefill?.assigneeIds}
        defaultSupervisorIds={prefill?.supervisorIds}
        defaultResponsibleUserId={
          prefill ? prefill.responsibleUserId : currentUserId
        }
      />
      {/* Cascading: pick the client first, then only their projects, then
          only that project's cases. Project can arrive pre-filled via
          ?projectId= when creating from a project. */}
      <CascadingMatterSelect
        subjects={subjects}
        projects={projects}
        cases={cases.map((legalCase) => ({
          id: legalCase.id,
          name: legalCase.name,
          projectId: legalCase.projectId,
          projectName: legalCase.project.name,
        }))}
        defaultSubjectId={prefill?.subjectId}
        defaultProjectId={prefill ? prefill.projectId : defaultProjectId}
        defaultCaseId={prefill ? prefill.caseId : defaultCaseId}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Typ lhůty">
          <SelectInput
            name="deadlineType"
            defaultValue={prefill?.deadlineType ?? "INTERNAL"}
          >
            {options.taskDeadlineTypes.map((type) => (
              <option key={type} value={type}>
                {taskDeadlineTypeLabels[type]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Začátek">
          <TextInput
            name="startDate"
            type="date"
            defaultValue={prefill?.startDate ?? pragueTodayIso()}
          />
        </Field>
        <Field label="Deadline">
          <TextInput name="deadline" type="date" defaultValue={prefill?.deadline ?? ""} />
        </Field>
      </div>
      <Field label="Krátký popis">
        <TextInput
          name="shortDescription"
          defaultValue={prefill?.shortDescription ?? ""}
        />
      </Field>
      <Field label="Detailní popis">
        <TextArea
          name="detailedDescription"
          defaultValue={prefill?.detailedDescription ?? ""}
        />
      </Field>
      <Field label="SharePoint URL">
        <TextInput
          name="sharepointUrl"
          type="url"
          defaultValue={prefill?.sharepointUrl ?? ""}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pendingLabel="Vytvářím…">
          {submitLabel}
        </Button>
        {cancelHref ? (
          <ButtonLink href={cancelHref} variant="ghost">
            Zrušit
          </ButtonLink>
        ) : null}
      </div>
    </form>
  );
}
