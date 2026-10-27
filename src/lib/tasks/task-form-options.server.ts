import "server-only";

import { getTeamOptionsWithMembers } from "@/lib/assignments-overview.server";
import type { getCurrentUser } from "@/lib/auth";
import { getOrgUserOptions } from "@/lib/org-users";
import {
  andWhere,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import type { getPrisma } from "@/lib/prisma";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
type PrismaClient = ReturnType<typeof getPrisma>;

// Nabídky formuláře nového úkolu (TaskCreateForm): aktivní členové kanceláře,
// týmy, viditelné nearchivované subjekty, projekty a případy. Stejné seznamy
// používá i filtr na /tasks.
export async function loadTaskFormOptions(
  prisma: PrismaClient,
  currentUser: CurrentUser,
) {
  const [users, teams, subjects, projects, cases] = await Promise.all([
    getOrgUserOptions(currentUser),
    getTeamOptionsWithMembers(prisma, currentUser.organizationId),
    prisma.subject.findMany({
      where: andWhere({ archivedAt: null }, subjectVisibilityWhere(currentUser)),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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
  ]);
  return { users, teams, subjects, projects, cases };
}

export type TaskFormOptions = Awaited<ReturnType<typeof loadTaskFormOptions>>;

export const emptyTaskFormOptions: TaskFormOptions = {
  users: [],
  teams: [],
  subjects: [],
  projects: [],
  cases: [],
};
