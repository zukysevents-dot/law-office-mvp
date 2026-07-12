import "server-only";

import type { getCurrentUser } from "@/lib/auth";
import {
  type MatterSelection,
  resolveMatterSelection,
} from "@/lib/matter-integrity";
import {
  andWhere,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import type { getPrisma } from "@/lib/prisma";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
type PrismaClient = ReturnType<typeof getPrisma>;

function projectFact(
  project: { id: string; mainSubjectId: string } | null,
) {
  return project
    ? { id: project.id, mainSubjectId: project.mainSubjectId }
    : null;
}

function caseFact(
  legalCase: {
    id: string;
    projectId: string;
    project: { mainSubjectId: string };
  } | null,
) {
  return legalCase
    ? {
        id: legalCase.id,
        projectId: legalCase.projectId,
        mainSubjectId: legalCase.project.mainSubjectId,
      }
    : null;
}

function taskFact(
  task: {
    id: string;
    projectId: string | null;
    caseId: string | null;
    project: { mainSubjectId: string } | null;
    case: {
      projectId: string;
      project: { mainSubjectId: string };
    } | null;
  } | null,
) {
  return task
    ? {
        id: task.id,
        projectId: task.projectId,
        caseId: task.caseId,
        caseProjectId: task.case?.projectId ?? null,
        mainSubjectId:
          task.case?.project.mainSubjectId ??
          task.project?.mainSubjectId ??
          null,
      }
    : null;
}

/**
 * Loads every submitted relation through the caller's visibility scope, then
 * resolves and re-loads any parent relation derived from a case/task. The
 * second pass prevents a visible standalone task from becoming a shortcut to
 * an otherwise invisible case or project.
 */
export async function resolveVisibleMatterSelection(
  prisma: PrismaClient,
  currentUser: CurrentUser,
  selection: MatterSelection,
) {
  const requestedProjectId = selection.projectId || null;
  const requestedCaseId = selection.caseId || null;
  const requestedSubjectId = selection.subjectId || null;
  const requestedTaskId = selection.taskId || null;

  const loadProject = (id: string) =>
    prisma.project.findFirst({
      where: andWhere({ id }, projectVisibilityWhere(currentUser)),
      select: { id: true, mainSubjectId: true, hourlyRate: true },
    });
  const loadCase = (id: string) =>
    prisma.case.findFirst({
      where: andWhere({ id }, caseVisibilityWhere(currentUser)),
      select: {
        id: true,
        projectId: true,
        hourlyRate: true,
        project: {
          select: { id: true, mainSubjectId: true, hourlyRate: true },
        },
      },
    });
  const loadSubject = (id: string) =>
    prisma.subject.findFirst({
      where: andWhere({ id }, subjectVisibilityWhere(currentUser)),
      select: { id: true, hourlyRate: true },
    });

  const [submittedProject, submittedCase, submittedSubject, task] =
    await Promise.all([
      requestedProjectId ? loadProject(requestedProjectId) : null,
      requestedCaseId ? loadCase(requestedCaseId) : null,
      requestedSubjectId ? loadSubject(requestedSubjectId) : null,
      requestedTaskId
        ? prisma.task.findFirst({
            where: andWhere(
              { id: requestedTaskId },
              taskVisibilityWhere(currentUser),
            ),
            select: {
              id: true,
              projectId: true,
              caseId: true,
              project: {
                select: {
                  id: true,
                  mainSubjectId: true,
                  hourlyRate: true,
                },
              },
              case: {
                select: {
                  id: true,
                  projectId: true,
                  hourlyRate: true,
                  project: {
                    select: {
                      id: true,
                      mainSubjectId: true,
                      hourlyRate: true,
                    },
                  },
                },
              },
            },
          })
        : null,
    ]);

  if (requestedProjectId && !submittedProject) {
    throw new Error("Projekt nenalezen nebo k němu nemáte oprávnění.");
  }
  if (requestedCaseId && !submittedCase) {
    throw new Error("Případ nenalezen nebo k němu nemáte oprávnění.");
  }
  if (requestedSubjectId && !submittedSubject) {
    throw new Error("Subjekt nenalezen nebo k němu nemáte oprávnění.");
  }
  if (requestedTaskId && !task) {
    throw new Error("Úkol nenalezen nebo k němu nemáte oprávnění.");
  }

  const tentative = resolveMatterSelection(selection, {
    project: projectFact(submittedProject),
    legalCase: caseFact(submittedCase),
    task: taskFact(task),
  });

  const [project, legalCase, subject] = await Promise.all([
    tentative.projectId === submittedProject?.id
      ? submittedProject
      : tentative.projectId
        ? loadProject(tentative.projectId)
        : null,
    tentative.caseId === submittedCase?.id
      ? submittedCase
      : tentative.caseId
        ? loadCase(tentative.caseId)
        : null,
    tentative.subjectId === submittedSubject?.id
      ? submittedSubject
      : tentative.subjectId
        ? loadSubject(tentative.subjectId)
        : null,
  ]);

  if (tentative.projectId && !project) {
    throw new Error("Projekt nenalezen nebo k němu nemáte oprávnění.");
  }
  if (tentative.caseId && !legalCase) {
    throw new Error("Případ nenalezen nebo k němu nemáte oprávnění.");
  }
  if (tentative.subjectId && !subject) {
    throw new Error("Subjekt nenalezen nebo k němu nemáte oprávnění.");
  }

  const resolved = resolveMatterSelection(selection, {
    project: projectFact(project),
    legalCase: caseFact(legalCase),
    task: taskFact(task),
  });

  return {
    ...resolved,
    caseHourlyRate: legalCase?.hourlyRate ?? null,
    projectHourlyRate: project?.hourlyRate ?? null,
    subjectHourlyRate: subject?.hourlyRate ?? null,
  };
}
