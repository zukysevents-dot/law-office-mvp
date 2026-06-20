import {
  andWhere,
  canViewAllLegalData,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import type { getPrisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";

type PrismaClient = ReturnType<typeof getPrisma>;
type PermissionUser = { id: string; role: UserRole };

export type ReportFilterOptions = {
  subjects: Array<{ id: string; name: string; ico: string | null }>;
  projects: Array<{ id: string; name: string }>;
  cases: Array<{ id: string; name: string; project: { name: string } }>;
  users: Array<{ id: string; name: string }>;
};

// Load the visibility-scoped option lists shared by every report filter form.
export async function loadReportFilterOptions(
  prisma: PrismaClient,
  currentUser: PermissionUser,
): Promise<ReportFilterOptions> {
  const [subjects, projects, cases, users] = await Promise.all([
    prisma.subject.findMany({
      where: andWhere({ archivedAt: null }, subjectVisibilityWhere(currentUser)),
      orderBy: { name: "asc" },
      select: { id: true, name: true, ico: true },
    }),
    prisma.project.findMany({
      where: andWhere({ archivedAt: null }, projectVisibilityWhere(currentUser)),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.case.findMany({
      where: andWhere({ archivedAt: null }, caseVisibilityWhere(currentUser)),
      orderBy: { name: "asc" },
      select: { id: true, name: true, project: { select: { name: true } } },
    }),
    prisma.user.findMany({
      // Only ADMIN/PARTNER may enumerate the firm's user directory; lower roles
      // can filter reports by themselves only.
      where: canViewAllLegalData(currentUser)
        ? { active: true }
        : { id: currentUser.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return { subjects, projects, cases, users };
}
