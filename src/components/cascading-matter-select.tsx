"use client";

import { useMemo, useState } from "react";

import { Field, SelectInput } from "@/components/form-field";
import {
  casesForSelection,
  initialCascadeSelection,
  nextSelectionOnCaseChange,
  nextSelectionOnProjectChange,
  nextSelectionOnSubjectChange,
  nextSelectionOnTaskChange,
  projectsForSubject,
  tasksForSelection,
  type MatterCascadeLists,
  type MatterCascadeState,
} from "@/lib/matter-cascade";

export type CascadingSubject = { id: string; name: string };
export type CascadingProject = {
  id: string;
  name: string;
  mainSubjectId: string | null;
};
export type CascadingCase = {
  id: string;
  name: string;
  projectId: string | null;
  projectName: string;
};
export type CascadingTask = {
  id: string;
  title: string;
  projectId: string | null;
  caseId: string | null;
};

// Dependent client → project → case (→ task) pickers. Lawyers asked that every
// matter picker work top-down: choose the client first, then only that client's
// projects and cases appear, then only that project's cases, then only that
// matter's tasks. Selecting a deeper level back-fills the higher ones, and
// changing (or clearing) a parent clears every child that no longer belongs to
// it. The rules live in src/lib/matter-cascade.ts (unit-tested). All filtering
// is client-side over lists already loaded for the page; the selects keep the
// same field names (subjectId/projectId/caseId/taskId) so server actions and
// GET filters are unchanged — the server still validates the hierarchy.
export function CascadingMatterSelect({
  subjects,
  projects,
  cases,
  tasks,
  includeTask = false,
  includeCase = true,
  requireSubject = false,
  requireProject = false,
  requireCase = false,
  defaultSubjectId = "",
  defaultProjectId = "",
  defaultCaseId = "",
  defaultTaskId = "",
  subjectLabel = "Klient",
  projectLabel = "Projekt",
  caseLabel = "Případ",
  subjectPlaceholder,
  projectPlaceholder,
  casePlaceholder,
  filterMode = false,
  className,
}: {
  subjects: CascadingSubject[];
  projects: CascadingProject[];
  cases: CascadingCase[];
  tasks?: CascadingTask[];
  includeTask?: boolean;
  includeCase?: boolean;
  requireSubject?: boolean;
  requireProject?: boolean;
  requireCase?: boolean;
  defaultSubjectId?: string;
  defaultProjectId?: string;
  defaultCaseId?: string;
  defaultTaskId?: string;
  subjectLabel?: string;
  projectLabel?: string;
  caseLabel?: string;
  /** Text of the empty option; defaults depend on filterMode / require*. */
  subjectPlaceholder?: string;
  projectPlaceholder?: string;
  casePlaceholder?: string;
  filterMode?: boolean;
  /** Overrides the wrapper grid column classes. */
  className?: string;
}) {
  const lists = useMemo<MatterCascadeLists>(
    () => ({ projects, cases, tasks: tasks ?? [] }),
    [projects, cases, tasks],
  );
  const [selection, setSelection] = useState<MatterCascadeState>(() =>
    initialCascadeSelection(
      {
        subjectId: defaultSubjectId,
        projectId: defaultProjectId,
        caseId: defaultCaseId,
        taskId: defaultTaskId,
      },
      lists,
    ),
  );

  const visibleProjects = useMemo(
    () => projectsForSubject(projects, selection.subjectId),
    [projects, selection.subjectId],
  );
  const visibleCases = useMemo(
    () => casesForSelection(cases, projects, selection),
    [cases, projects, selection],
  );
  const visibleTasks = useMemo(
    () => (tasks ? tasksForSelection(tasks, cases, projects, selection) : []),
    [tasks, cases, projects, selection],
  );

  // In filterMode the selects become direct items of the parent filter grid
  // ("contents" alone — combined with "grid" the display would stay grid and
  // the three selects would stack in one column).
  const wrapperClass =
    className !== undefined
      ? `grid gap-4 ${className}`
      : filterMode
        ? "contents"
        : `grid gap-4 ${
            includeTask
              ? "md:grid-cols-2 xl:grid-cols-4"
              : includeCase
                ? "md:grid-cols-3"
                : "md:grid-cols-2"
          }`;

  const subjectEmpty =
    subjectPlaceholder ?? (filterMode ? "Všichni klienti" : "Vyberte klienta");
  const projectEmpty =
    projectPlaceholder ??
    (filterMode
      ? "Všechny projekty"
      : requireProject
        ? "Vyberte projekt"
        : "Bez projektu");
  const caseEmpty =
    casePlaceholder ??
    (filterMode
      ? "Všechny případy"
      : requireCase
        ? "Vyberte případ"
        : "Bez případu");

  return (
    <div className={wrapperClass}>
      <Field label={subjectLabel}>
        <SelectInput
          name="subjectId"
          value={selection.subjectId}
          required={requireSubject}
          onChange={(event) => {
            const value = event.target.value;
            setSelection((state) =>
              nextSelectionOnSubjectChange(state, value, lists),
            );
          }}
        >
          <option value="">{subjectEmpty}</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label={projectLabel}>
        <SelectInput
          name="projectId"
          value={selection.projectId}
          required={requireProject}
          onChange={(event) => {
            const value = event.target.value;
            setSelection((state) =>
              nextSelectionOnProjectChange(state, value, lists),
            );
          }}
        >
          <option value="">{projectEmpty}</option>
          {visibleProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </SelectInput>
      </Field>
      {includeCase ? (
        <Field label={caseLabel}>
          <SelectInput
            name="caseId"
            value={selection.caseId}
            required={requireCase}
            onChange={(event) => {
              const value = event.target.value;
              setSelection((state) =>
                nextSelectionOnCaseChange(state, value, lists),
              );
            }}
          >
            <option value="">{caseEmpty}</option>
            {visibleCases.map((legalCase) => (
              <option key={legalCase.id} value={legalCase.id}>
                {legalCase.name}
                {legalCase.projectName ? ` / ${legalCase.projectName}` : ""}
              </option>
            ))}
          </SelectInput>
        </Field>
      ) : null}
      {includeTask ? (
        <Field label="Úkol">
          <SelectInput
            name="taskId"
            value={selection.taskId}
            onChange={(event) => {
              const value = event.target.value;
              setSelection((state) =>
                nextSelectionOnTaskChange(state, value, lists),
              );
            }}
          >
            <option value="">{filterMode ? "Všechny úkoly" : "Bez úkolu"}</option>
            {visibleTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </SelectInput>
        </Field>
      ) : null}
    </div>
  );
}
