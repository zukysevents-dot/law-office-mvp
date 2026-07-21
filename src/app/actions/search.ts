"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  andWhere,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

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

  const [subjects, projects, cases, tasks] = await Promise.all([
    prisma.subject.findMany({
      where: andWhere(subjectVisibilityWhere(user), {
        archivedAt: null,
        OR: [{ name: like }, { ico: like }],
      }),
      select: { id: true, name: true, ico: true },
      take: 5,
    }),
    prisma.project.findMany({
      where: andWhere(projectVisibilityWhere(user), {
        archivedAt: null,
        name: like,
      }),
      select: { id: true, name: true },
      take: 5,
    }),
    prisma.case.findMany({
      where: andWhere(caseVisibilityWhere(user), {
        archivedAt: null,
        OR: [{ name: like }, { fileNumber: like }],
      }),
      select: { id: true, name: true, fileNumber: true },
      take: 5,
    }),
    prisma.task.findMany({
      where: andWhere(taskVisibilityWhere(user), {
        archivedAt: null,
        title: like,
      }),
      select: { id: true, title: true },
      take: 5,
    }),
  ]);

  return [
    ...subjects.map((s) => ({
      type: "subject" as const,
      id: s.id,
      label: s.name,
      sub: s.ico ? `IČO ${s.ico}` : LABELS.subject,
      href: `/subjects/${s.id}`,
    })),
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
