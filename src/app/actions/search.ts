"use server";

import { getCurrentUser } from "@/lib/auth";
import { getAccessibleModules } from "@/lib/module-access.server";
import {
  andWhere,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import {
  subjectMatchReasons,
  subjectSearchInclude,
  subjectSearchWhere,
} from "@/lib/subjects/search";

export type SearchHit = {
  type: "subject" | "project" | "case" | "task";
  id: string;
  label: string;
  sub: string | null;
  href: string;
};

const LABELS = {
  subject: "Subjekt",
  project: "Projekt",
  case: "Případ",
  task: "Úkol",
} as const;

// F5: global search. CRITICAL — every query is composed with the matching
// *VisibilityWhere(user) so results never leak records the user may not see.
// ponytail: plain case-insensitive `contains`, no unaccent yet. Add a pg_trgm +
// unaccent index only if Czech-diacritic recall proves insufficient in use.
export async function globalSearch(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const user = await getCurrentUser();
  const prisma = getPrisma();
  const like = { contains: q, mode: "insensitive" as const };
  // Only search sections the user may open (permission matrix, CORE modules):
  // a hit would otherwise link to a "Přístup odepřen" page.
  const modules = new Set(await getAccessibleModules(user));
  const none = Promise.resolve([]);

  const [subjects, projects, cases, tasks] = await Promise.all([
    !modules.has("module.subjects") ? none : prisma.subject.findMany({
      where: andWhere(
        subjectVisibilityWhere(user),
        { archivedAt: null },
        subjectSearchWhere(q),
      ),
      select: {
        id: true,
        name: true,
        ico: true,
        firstName: true,
        lastName: true,
        tradeName: true,
        email: true,
        birthNumber: true,
        ...subjectSearchInclude,
      },
      orderBy: { name: "asc" },
      take: 5,
    }),
    !modules.has("module.projects") ? none : prisma.project.findMany({
      where: andWhere(projectVisibilityWhere(user), {
        archivedAt: null,
        name: like,
      }),
      select: { id: true, name: true },
      take: 5,
    }),
    !modules.has("module.cases") ? none : prisma.case.findMany({
      where: andWhere(caseVisibilityWhere(user), {
        archivedAt: null,
        OR: [{ name: like }, { fileNumber: like }],
      }),
      select: { id: true, name: true, fileNumber: true },
      take: 5,
    }),
    !modules.has("module.tasks") ? none : prisma.task.findMany({
      where: andWhere(taskVisibilityWhere(user), {
        archivedAt: null,
        title: like,
      }),
      select: { id: true, title: true },
      take: 5,
    }),
  ]);

  return [
    ...subjects.map((s) => {
      // The match reason never carries the full birth number (masked) and the
      // RČ itself is not part of the returned hit.
      const reasons = subjectMatchReasons(s, q);
      const base = s.ico ? `IČO ${s.ico}` : LABELS.subject;
      return {
        type: "subject" as const,
        id: s.id,
        label: s.name,
        sub: reasons.length > 0 ? `${base} · Shoda: ${reasons[0]}` : base,
        href: `/subjects/${s.id}`,
      };
    }),
    ...projects.map((p) => ({
      type: "project" as const,
      id: p.id,
      label: p.name,
      sub: LABELS.project,
      href: `/projects/${p.id}`,
    })),
    ...cases.map((c) => ({
      type: "case" as const,
      id: c.id,
      label: c.name,
      sub: c.fileNumber ? `Sp. zn. ${c.fileNumber}` : LABELS.case,
      href: `/cases/${c.id}`,
    })),
    ...tasks.map((t) => ({
      type: "task" as const,
      id: t.id,
      label: t.title,
      sub: LABELS.task,
      href: `/tasks/${t.id}`,
    })),
  ];
}
