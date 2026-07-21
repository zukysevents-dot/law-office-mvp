"use client";

import { useState } from "react";

import { Field, SelectInput } from "@/components/form-field";
import { SearchableSelect } from "@/components/searchable-select";

type Option = { id: string; label: string };
type ProjectOption = Option & { subjectId?: string | null };
type CaseOption = Option & { projectId?: string | null };

type Props = {
  subjectOptions?: Option[];
  projectOptions: ProjectOption[];
  caseOptions: CaseOption[];
  taskOptions?: Option[];
  defaults?: {
    subjectId?: string;
    projectId?: string;
    caseId?: string;
    taskId?: string;
  };
  showSubject?: boolean;
  showTask?: boolean;
};

// Cascading matter picker: choosing a subject narrows the project list, and a
// project narrows the case list. An empty parent shows everything, so the user
// is never forced to fill in the hierarchy top-down. Field names stay
// subjectId/projectId/caseId/taskId, so the existing FormData server actions are
// unchanged. Tasks are left unfiltered (a task may hang off a project, not a
// case) to avoid hiding valid options.
export function ScopeSelect({
  subjectOptions = [],
  projectOptions,
  caseOptions,
  taskOptions = [],
  defaults = {},
  showSubject = true,
  showTask = true,
}: Props) {
  const [subjectId, setSubjectId] = useState(defaults.subjectId ?? "");
  const [projectId, setProjectId] = useState(defaults.projectId ?? "");
  const [caseId, setCaseId] = useState(defaults.caseId ?? "");

  const visibleProjects =
    showSubject && subjectId
      ? projectOptions.filter((p) => p.subjectId === subjectId)
      : projectOptions;
  const visibleCases = projectId
    ? caseOptions.filter((c) => c.projectId === projectId)
    : caseOptions;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {showSubject ? (
        <Field label="Subjekt (klient)">
          <SearchableSelect
            name="subjectId"
            options={subjectOptions}
            defaultValue={subjectId}
            emptyLabel="Vyhledat klienta (nebo nechte prázdné)"
            onSelect={(id) => {
              setSubjectId(id);
              setProjectId("");
              setCaseId("");
            }}
          />
        </Field>
      ) : null}
      <Field label="Projekt">
        <SelectInput
          name="projectId"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setCaseId("");
          }}
        >
          <option value="">Bez projektu</option>
          {visibleProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.label}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Případ">
        {/* Remount when the project filter changes so the picker clears. */}
        <SearchableSelect
          key={`case-${projectId}`}
          name="caseId"
          options={visibleCases}
          defaultValue={caseId}
          emptyLabel="Vyhledat případ (nebo nechte prázdné)"
          onSelect={setCaseId}
        />
      </Field>
      {showTask ? (
        <Field label="Úkol">
          <SelectInput name="taskId" defaultValue={defaults.taskId ?? ""}>
            <option value="">Bez úkolu</option>
            {taskOptions.map((task) => (
              <option key={task.id} value={task.id}>
                {task.label}
              </option>
            ))}
          </SelectInput>
        </Field>
      ) : null}
    </div>
  );
}
