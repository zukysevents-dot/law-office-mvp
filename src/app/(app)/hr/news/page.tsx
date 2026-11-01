import { Pin } from "lucide-react";

import { archiveHrNews, restoreHrNews } from "@/app/actions/hr-news";
import { AccessDenied } from "@/components/access-denied";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { HrNewsForm, type HrNewsFormValues } from "@/components/hr-news-form";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { ModuleKey, UserRole } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDateTime, formatDateUtc } from "@/lib/format";
import { officeWorkDate } from "@/lib/hr/attendance-calc";
import { isNewsActive, newsAudienceSummary } from "@/lib/hr/news";
import { userRoleLabels } from "@/lib/labels";
import { moduleAccessDenial } from "@/lib/module-access.server";
import { getOrgUserOptions } from "@/lib/org-users";
import {
  andWhere,
  canManageHrNews,
  hrNewsVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const newsInclude = {
  createdBy: { select: { name: true } },
  recipients: {
    select: { userId: true, user: { select: { name: true } } },
  },
} satisfies Prisma.HrNewsInclude;

type NewsRow = Prisma.HrNewsGetPayload<{ include: typeof newsInclude }>;

type Data = {
  news: NewsRow[];
  archived: NewsRow[];
  canManage: boolean;
  members: Array<{ id: string; name: string }>;
  editing: NewsRow | null;
};

const emptyData: Data = {
  news: [],
  archived: [],
  canManage: false,
  members: [],
  editing: null,
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toFormValues(news: NewsRow): HrNewsFormValues {
  return {
    id: news.id,
    title: news.title,
    body: news.body,
    audience: news.audience,
    roles: news.audienceRoles,
    recipientIds: news.recipients.map((recipient) => recipient.userId),
    pinned: news.pinned,
    visibleUntil: news.visibleUntil ? news.visibleUntil.toISOString().slice(0, 10) : "",
  };
}

const roleOptions = Object.values(UserRole).map((role) => ({
  value: role,
  label: userRoleLabels[role],
}));

export default async function HrNewsPage({ searchParams }: PageProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.hr");
  if (accessDenied) {
    return <AccessDenied title="Aktuality" message={accessDenied} />;
  }

  const params = await searchParams;
  const editId = firstParam(params.edit) ?? null;
  const showArchived = firstParam(params.archived) === "1";

  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.HR_ATTENDANCE);
    const prisma = getPrisma();
    const canManage = canManageHrNews(currentUser);
    const visibility = hrNewsVisibilityWhere(currentUser);

    const [news, archived, members] = await Promise.all([
      prisma.hrNews.findMany({
        where: andWhere({ archivedAt: null }, visibility),
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        include: newsInclude,
        take: 100,
      }),
      canManage && showArchived
        ? prisma.hrNews.findMany({
            where: andWhere({ archivedAt: { not: null } }, visibility),
            orderBy: { archivedAt: "desc" },
            include: newsInclude,
            take: 100,
          })
        : Promise.resolve([]),
      canManage ? getOrgUserOptions(currentUser) : Promise.resolve([]),
    ]);

    const editing =
      canManage && editId ? news.find((item) => item.id === editId) ?? null : null;

    return { news, archived, canManage, members, editing };
  });

  const data = result.data ?? emptyData;
  const today = officeWorkDate(new Date());

  return (
    <>
      <PageHeader
        title="Aktuality"
        description="Oznámení pro kancelář – noví kolegové, provozní události, teambuildingy. Aktuality určené vám se ukazují i na dashboardu (widget Aktuality)."
        action={
          data.canManage ? (
            <ButtonLink
              href={showArchived ? "/hr/news" : "/hr/news?archived=1"}
              variant="ghost"
            >
              {showArchived ? "Skrýt archiv" : "Zobrazit archiv"}
            </ButtonLink>
          ) : null
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {data.canManage ? (
        <Section title={data.editing ? "Upravit aktualitu" : "Nová aktualita"}>
          <HrNewsForm
            key={data.editing?.id ?? "new"}
            initial={data.editing ? toFormValues(data.editing) : undefined}
            roleOptions={roleOptions}
            memberOptions={data.members}
          />
        </Section>
      ) : null}

      <Section title="Aktuální oznámení">
        {data.news.length > 0 ? (
          <ul className="grid gap-3" data-testid="hr-news-list">
            {data.news.map((news) => (
              <NewsCard
                key={news.id}
                news={news}
                canManage={data.canManage}
                expired={!isNewsActive(news, today)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState>Zatím tu nejsou žádné aktuality.</EmptyState>
        )}
      </Section>

      {data.canManage && showArchived ? (
        <Section title="Archiv aktualit">
          {data.archived.length > 0 ? (
            <ul className="grid gap-3">
              {data.archived.map((news) => (
                <NewsCard key={news.id} news={news} canManage archivedView expired={false} />
              ))}
            </ul>
          ) : (
            <EmptyState>Archiv je prázdný.</EmptyState>
          )}
        </Section>
      ) : null}
    </>
  );
}

function NewsCard({
  news,
  canManage,
  expired,
  archivedView = false,
}: {
  news: NewsRow;
  canManage: boolean;
  expired: boolean;
  archivedView?: boolean;
}) {
  return (
    <li
      className="min-w-0 rounded-md border border-[#dce4e8] bg-[#F4F7F8]/55 p-4"
      data-testid="hr-news-item"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 break-words text-base font-semibold text-[#0e1822]">
            {news.pinned ? (
              <Pin className="h-4 w-4 shrink-0 text-[#17A2A2]" aria-label="Připnuto" />
            ) : null}
            {news.title}
            {expired ? <Badge tone="neutral">Mimo dashboard</Badge> : null}
            {archivedView ? <Badge tone="neutral">Archivováno</Badge> : null}
          </h3>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#566673]">
            <span>{formatDateTime(news.createdAt)}</span>
            {news.createdBy ? <span>{news.createdBy.name}</span> : null}
            <span>{newsAudienceSummary(news, userRoleLabels)}</span>
            {news.visibleUntil ? (
              <span>Na dashboardu do {formatDateUtc(news.visibleUntil)}</span>
            ) : null}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {archivedView ? (
              <ConfirmActionForm
                action={restoreHrNews.bind(null, news.id)}
                label="Obnovit"
                message={`Obnovit aktualitu „${news.title}“?`}
                variant="ghost"
              />
            ) : (
              <>
                <ButtonLink href={`/hr/news?edit=${news.id}`} variant="ghost" className="h-9 px-3">
                  Upravit
                </ButtonLink>
                <ConfirmActionForm
                  action={archiveHrNews.bind(null, news.id)}
                  label="Archivovat"
                  message={`Archivovat aktualitu „${news.title}“? Zmizí z dashboardu i ze seznamu, v archivu ji půjde obnovit.`}
                  variant="ghost"
                />
              </>
            )}
          </div>
        ) : null}
      </div>
      <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-[#0e1822]">
        {news.body}
      </p>
    </li>
  );
}
