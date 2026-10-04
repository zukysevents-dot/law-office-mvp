import { Folder } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { isSharepointUrlConfigured } from "@/lib/microsoft/config";
import { matterBrowsePath } from "@/lib/microsoft/matter-folder";
import type { SharepointEntityType } from "@/lib/microsoft/sharepoint";
import {
  andWhere,
  canViewAllLegalData,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Row = {
  type: SharepointEntityType;
  id: string;
  title: string;
  subtitle: string | null;
};

type Group = { heading: string; rows: Row[] };

type Data = { configured: boolean; canConfigure: boolean; groups: Group[] };

const EMPTY: Data = { configured: false, canConfigure: false, groups: [] };

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function SharepointIndexPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const result = await safeQuery<Data>(EMPTY, async () => {
    const prisma = getPrisma();
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);

    const nameFilter = query
      ? { name: { contains: query, mode: "insensitive" as const } }
      : null;
    const active = { archivedAt: null };

    const [subjects, projects, cases] = await Promise.all([
      prisma.subject.findMany({
        where: andWhere(active, nameFilter, subjectVisibilityWhere(currentUser)),
        select: { id: true, name: true, ico: true },
        orderBy: { name: "asc" },
        take: 100,
      }),
      prisma.project.findMany({
        where: andWhere(active, nameFilter, projectVisibilityWhere(currentUser)),
        select: { id: true, name: true, mainSubject: { select: { name: true } } },
        orderBy: { name: "asc" },
        take: 100,
      }),
      prisma.case.findMany({
        where: andWhere(active, nameFilter, caseVisibilityWhere(currentUser)),
        select: {
          id: true,
          name: true,
          fileNumber: true,
          project: { select: { name: true } },
        },
        orderBy: { name: "asc" },
        take: 100,
      }),
    ]);

    return {
      configured: await isSharepointUrlConfigured(currentUser.organizationId),
      canConfigure: canViewAllLegalData(currentUser),
      groups: [
        {
          heading: "Subjekty",
          rows: subjects.map((subject) => ({
            type: "Subject" as const,
            id: subject.id,
            title: subject.name,
            subtitle: subject.ico ? `IČO ${subject.ico}` : null,
          })),
        },
        {
          heading: "Projekty",
          rows: projects.map((project) => ({
            type: "Project" as const,
            id: project.id,
            title: project.name,
            subtitle: project.mainSubject?.name ?? null,
          })),
        },
        {
          heading: "Případy",
          rows: cases.map((legalCase) => ({
            type: "Case" as const,
            id: legalCase.id,
            title: legalCase.fileNumber
              ? `${legalCase.name} (${legalCase.fileNumber})`
              : legalCase.name,
            subtitle: legalCase.project?.name ?? null,
          })),
        },
      ],
    };
  });

  const data = result.data ?? EMPTY;
  const total = data.groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <>
      <PageHeader
        title="SharePoint"
        description="Složky spisů tak, jak je má kancelář v SharePointu. Vidíte jen spisy, ke kterým máte přístup."
        action={
          data.canConfigure ? (
            <div className="flex flex-wrap gap-2">
              {data.configured ? (
                <ButtonLink href="/documents/sharepoint/library">
                  Procházet celou knihovnu
                </ButtonLink>
              ) : null}
              <ButtonLink href="/settings/sharepoint" variant="secondary">
                Nastavení připojení
              </ButtonLink>
            </div>
          ) : null
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {result.databaseReady && !data.configured ? (
        <Section title="SharePoint není připojený">
          <p className="text-sm text-stone-600">
            Kancelář zatím nemá nastavený web SharePointu. Připojení nastaví
            partner nebo administrátor.
          </p>
        </Section>
      ) : null}

      <Section title="Hledat spis">
        <form className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-stone-700">Název</span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Např. Novák"
              className="h-10 rounded-md border border-[#dce4e8] px-3 text-sm"
            />
          </label>
          <ButtonLink href="/documents/sharepoint" variant="ghost">
            Zrušit filtr
          </ButtonLink>
          <button
            type="submit"
            className="h-10 rounded-md bg-emerald-950 px-4 text-sm font-medium text-white"
          >
            Hledat
          </button>
        </form>
      </Section>

      {total === 0 ? (
        <EmptyState>
          {query
            ? "Žádný spis neodpovídá hledání."
            : "Zatím tu nejsou žádné spisy, ke kterým byste měli přístup."}
        </EmptyState>
      ) : (
        data.groups
          .filter((group) => group.rows.length > 0)
          .map((group) => (
            <Section key={group.heading} title={group.heading}>
              <ul className="grid gap-1">
                {group.rows.map((row) => (
                  <li key={`${row.type}-${row.id}`}>
                    <Link
                      href={matterBrowsePath(row.type, row.id)}
                      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-[#F4F7F8]"
                    >
                      <Folder
                        className="h-4 w-4 shrink-0 text-stone-500"
                        aria-hidden="true"
                      />
                      <span className="font-medium text-stone-950">{row.title}</span>
                      {row.subtitle ? (
                        <span className="text-sm text-stone-500">{row.subtitle}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ))
      )}
    </>
  );
}
