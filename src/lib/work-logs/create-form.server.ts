import "server-only";

import type { getCurrentUser } from "@/lib/auth";
import {
  andWhere,
  canViewRates,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import type { getPrisma } from "@/lib/prisma";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
type PrismaClient = ReturnType<typeof getPrisma>;

export type WorkLogFormSubject = { id: string; name: string; ico: string | null };
export type WorkLogFormProject = { id: string; name: string; mainSubjectId: string };
export type WorkLogFormCase = {
  id: string;
  name: string;
  projectId: string;
  project: { name: string };
};
export type WorkLogFormTask = {
  id: string;
  title: string;
  projectId: string | null;
  caseId: string | null;
  mine: boolean;
};

export type WorkLogFormOptions = {
  subjects: WorkLogFormSubject[];
  projects: WorkLogFormProject[];
  cases: WorkLogFormCase[];
  tasks: WorkLogFormTask[];
  timeIncrementMinutes: number;
  canViewRates: boolean;
};

export const emptyWorkLogFormOptions: WorkLogFormOptions = {
  subjects: [],
  projects: [],
  cases: [],
  tasks: [],
  timeIncrementMinutes: 15,
  canViewRates: false,
};

const ARCHIVED_SUFFIX = " (archiv)";

/**
 * Nabídky formuláře nového výkazu práce (WorkLogCreateForm): viditelné
 * nearchivované subjekty, projekty, případy a úkoly, krok zaokrouhlení
 * kanceláře a právo vidět sazby. `includeTaskId` („Vykázat práci“ u úkolu):
 * dokončený úkol je automaticky archivovaný a v nabídce by chyběl — dotáhne se
 * (přes taskVisibilityWhere) i s projektem / případem / subjektem, pokud je
 * divák vidí. Server (resolveVisibleMatterSelection) archivované, ale viditelné
 * záznamy přijme.
 */
export async function loadWorkLogFormOptions(
  prisma: PrismaClient,
  currentUser: CurrentUser,
  { includeTaskId }: { includeTaskId?: string | null } = {},
): Promise<WorkLogFormOptions> {
  const [subjects, projects, cases, tasks, organization] = await Promise.all([
    prisma.subject.findMany({
      where: andWhere({ archivedAt: null }, subjectVisibilityWhere(currentUser)),
      orderBy: { name: "asc" },
      select: { id: true, name: true, ico: true },
    }),
    prisma.project.findMany({
      where: andWhere({ archivedAt: null }, projectVisibilityWhere(currentUser)),
      orderBy: { name: "asc" },
      select: { id: true, name: true, mainSubjectId: true },
    }),
    prisma.case.findMany({
      where: andWhere({ archivedAt: null }, caseVisibilityWhere(currentUser)),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        projectId: true,
        project: { select: { name: true } },
      },
    }),
    prisma.task.findMany({
      where: andWhere({ archivedAt: null }, taskVisibilityWhere(currentUser)),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        projectId: true,
        caseId: true,
        // „Moje úkoly“ ve výběru: hlavní řešitel nebo řádek řešitele/dohledu.
        assignedToId: true,
        assignees: {
          where: { userId: currentUser.id },
          select: { userId: true },
        },
      },
    }),
    prisma.organization.findUnique({
      where: { id: currentUser.organizationId },
      select: { billingTimeIncrementMinutes: true },
    }),
  ]);

  const options: WorkLogFormOptions = {
    subjects,
    projects,
    cases,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      caseId: task.caseId,
      mine: task.assignedToId === currentUser.id || task.assignees.length > 0,
    })),
    timeIncrementMinutes: organization?.billingTimeIncrementMinutes ?? 15,
    canViewRates: canViewRates(currentUser),
  };

  if (includeTaskId && !options.tasks.some((task) => task.id === includeTaskId)) {
    await appendArchivedTask(prisma, currentUser, options, includeTaskId);
  }

  return options;
}

async function appendArchivedTask(
  prisma: PrismaClient,
  currentUser: CurrentUser,
  options: WorkLogFormOptions,
  taskId: string,
) {
  const task = await prisma.task.findFirst({
    where: andWhere({ id: taskId }, taskVisibilityWhere(currentUser)),
    select: {
      id: true,
      title: true,
      projectId: true,
      caseId: true,
      assignedToId: true,
      assignees: { where: { userId: currentUser.id }, select: { userId: true } },
      case: { select: { projectId: true } },
    },
  });
  if (!task) {
    return;
  }

  const projectId = task.case?.projectId ?? task.projectId;
  const [legalCase, project] = await Promise.all([
    task.caseId && !options.cases.some((item) => item.id === task.caseId)
      ? prisma.case.findFirst({
          where: andWhere({ id: task.caseId }, caseVisibilityWhere(currentUser)),
          select: {
            id: true,
            name: true,
            projectId: true,
            project: { select: { name: true } },
          },
        })
      : null,
    projectId && !options.projects.some((item) => item.id === projectId)
      ? prisma.project.findFirst({
          where: andWhere({ id: projectId }, projectVisibilityWhere(currentUser)),
          select: { id: true, name: true, mainSubjectId: true },
        })
      : null,
  ]);
  const caseMissing =
    Boolean(task.caseId) && !legalCase && !options.cases.some((item) => item.id === task.caseId);
  const projectMissing =
    Boolean(projectId) && !project && !options.projects.some((item) => item.id === projectId);
  // Úkol, jehož projekt / případ divák nevidí, se nenabízí (server by ho
  // stejně odmítl).
  if (caseMissing || projectMissing) {
    return;
  }
  if (legalCase) {
    options.cases.push({ ...legalCase, name: `${legalCase.name}${ARCHIVED_SUFFIX}` });
  }
  if (project) {
    options.projects.push({ ...project, name: `${project.name}${ARCHIVED_SUFFIX}` });
  }
  const subjectId = (project ?? options.projects.find((item) => item.id === projectId))
    ?.mainSubjectId;
  if (subjectId && !options.subjects.some((item) => item.id === subjectId)) {
    const subject = await prisma.subject.findFirst({
      where: andWhere({ id: subjectId }, subjectVisibilityWhere(currentUser)),
      select: { id: true, name: true, ico: true },
    });
    if (subject) {
      options.subjects.push({ ...subject, name: `${subject.name}${ARCHIVED_SUFFIX}` });
    }
  }
  options.tasks.unshift({
    id: task.id,
    title: `${task.title}${ARCHIVED_SUFFIX}`,
    projectId: task.projectId,
    caseId: task.caseId,
    mine: task.assignedToId === currentUser.id || task.assignees.length > 0,
  });
}
