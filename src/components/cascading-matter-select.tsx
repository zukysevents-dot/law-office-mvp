"use client";

import { useMemo, useState } from "react";

import { Field, SelectInput } from "@/components/form-field";

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

// Dependent client → project → case (→ task) pickers. Lawyers asked that a new
// task/work log be filled top-down: choose the client first, then only that
// client's projects appear, then only that project's cases, then only that
// matter's tasks. Selecting a deeper level back-fills the higher ones. All
// filtering is client-side over lists already loaded for the page; the selects
// keep the same field names so the server actions are unchanged.
export function CascadingMatterSelect({
  subjects,
  projects,
  cases,
  tasks,
  includeTask = false,
  requireProject = false,
  requireCase = false,
  defaultSubjectId = "",
  defaultProjectId = "",
  defaultCaseId = "",
  defaultTaskId = "",
  subjectLabel = "Klient",
}: {
  subjects: CascadingSubject[];
  projects: CascadingProject[];
  cases: CascadingCase[];
  tasks?: CascadingTask[];
  includeTask?: boolean;
  requireProject?: boolean;
  requireCase?: boolean;
  defaultSubjectId?: string;
  defaultProjectId?: string;
  defaultCaseId?: string;
  defaultTaskId?: string;
  subjectLabel?: string;
}) {
  const initialSubject =
    defaultSubjectId ||
    projects.find((project) => project.id === defaultProjectId)?.mainSubjectId ||
    "";

  const [subjectId, setSubjectId] = useState(initialSubject);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [caseId, setCaseId] = useState(defaultCaseId);
  const [taskId, setTaskId] = useState(defaultTaskId);

  const visibleProjects = useMemo(
    () =>
      subjectId
        ? projects.filter((project) => project.mainSubjectId === subjectId)
        : projects,
    [projects, subjectId],
  );
  const visibleCases = useMemo(
    () =>
      projectId
        ? cases.filter((legalCase) => legalCase.projectId === projectId)
        : cases,
    [cases, projectId],
  );
  const visibleTasks = useMemo(() => {
    if (!tasks) {
      return [];
    }
    if (caseId) {
      return tasks.filter((task) => task.caseId === caseId);
    }
    if (projectId) {
      return tasks.filter((task) => task.projectId === projectId);
    }
    return tasks;
  }, [tasks, projectId, caseId]);

  function handleSubjectChange(value: string) {
    setSubjectId(value);
    const project = projects.find((item) => item.id === projectId);
    if (value && project && project.mainSubjectId !== value) {
      setProjectId("");
      setCaseId("");
      setTaskId("");
    }
  }

  function handleProjectChange(value: string) {
    setProjectId(value);
    const project = projects.find((item) => item.id === value);
    if (project?.mainSubjectId) {
      setSubjectId(project.mainSubjectId);
    }
    const legalCase = cases.find((item) => item.id === caseId);
    if (value && legalCase && legalCase.projectId !== value) {
      setCaseId("");
      setTaskId("");
    }
  }

  function handleCaseChange(value: string) {
    setCaseId(value);
    const legalCase = cases.find((item) => item.id === value);
    if (legalCase?.projectId) {
      setProjectId(legalCase.projectId);
      const project = projects.find((item) => item.id === legalCase.projectId);
      if (project?.mainSubjectId) {
        setSubjectId(project.mainSubjectId);
      }
    }
    setTaskId("");
  }

  const columns = includeTask ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3";

  return (
    <div className={`grid gap-4 ${columns}`}>
      <Field label={subjectLabel}>
        <SelectInput
          name="subjectId"
          value={subjectId}
          onChange={(event) => handleSubjectChange(event.target.value)}
        >
          <option value="">Vyberte klienta</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Projekt">
        <SelectInput
          name="projectId"
          value={projectId}
          required={requireProject}
          onChange={(event) => handleProjectChange(event.target.value)}
        >
          <option value="">
            {requireProject ? "Vyberte projekt" : "Bez projektu"}
          </option>
          {visibleProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Případ">
        <SelectInput
          name="caseId"
          value={caseId}
          required={requireCase}
          onChange={(event) => handleCaseChange(event.target.value)}
        >
          <option value="">
            {requireCase ? "Vyberte případ" : "Bez případu"}
          </option>
          {visibleCases.map((legalCase) => (
            <option key={legalCase.id} value={legalCase.id}>
              {legalCase.name}
              {legalCase.projectName ? ` / ${legalCase.projectName}` : ""}
            </option>
          ))}
        </SelectInput>
      </Field>
      {includeTask ? (
        <Field label="Úkol">
          <SelectInput
            name="taskId"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
          >
            <option value="">Bez úkolu</option>
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
