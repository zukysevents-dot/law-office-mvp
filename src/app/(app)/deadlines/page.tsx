import Link from "next/link";
import { Plus } from "lucide-react";

import { createDeadline } from "@/app/actions/deadlines";
import { DeadlineFulfilDialog } from "@/components/deadlines/deadline-fulfil-dialog";
import {
  ArchivedDeadlineActions,
  FulfilledDeadlineActions,
} from "@/components/deadlines/deadline-row-actions";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { DeadlineStatus, DeadlineType, ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  DEADLINE_LIST_VIEWS,
  deadlineListViewLabels,
  deadlineListWhere,
  normalizeDeadlineListView,
  type DeadlineListView,
} from "@/lib/deadlines";
import { formatDateTimeUtc, formatDateUtc } from "@/lib/format";
import { deadlineStatusLabels, deadlineTypeLabels } from "@/lib/labels";
import {
  andWhere,
  canManageDeadlines,
  caseVisibilityWhere,
  courtHearingVisibilityWhere,
  deadlineVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { deadlineStatusTone, deadlineTypeTone } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import { AccessDenied } from "@/components/access-denied";
import { moduleAccessDenial } from "@/lib/module-access.server";

export const dynamic = "force-dynamic";

const UPCOMING_WINDOW_DAYS = 30;

const deadlineInclude = {
  case: { select: { id: true, name: true } },
  responsibleUser: { select: { name: true } },
  completedBy: { select: { name: true } },
} satisfies Prisma.DeadlineInclude;

const hearingInclude = {
  case: { select: { id: true, name: true } },
  responsibleUser: { select: { name: true } },
} satisfies Prisma.CourtHearingInclude;

type DeadlineRow = Prisma.DeadlineGetPayload<{ include: typeof deadlineInclude }>;
type HearingRow = Prisma.CourtHearingGetPayload<{ include: typeof hearingInclude }>;

type Data = {
  view: DeadlineListView;
  overdue: DeadlineRow[];
  upcoming: DeadlineRow[];
  later: DeadlineRow[];
  fulfilled: DeadlineRow[];
  archived: DeadlineRow[];
  hearings: HearingRow[];
  cases: Array<{ id: string; name: string; project: { name: string } }>;
  members: Array<{ id: string; name: string }>;
  canManage: boolean;
};

const emptyData: Data = {
  view: "active",
  overdue: [],
  upcoming: [],
  later: [],
  fulfilled: [],
  archived: [],
  hearings: [],
  cases: [],
  members: [],
  canManage: false,
};

const caseLinkClass = "text-[#0e1822] underline-offset-2 hover:underline";

function ActiveDeadlineTable({
  rows,
  canManage,
  overdue = false,
}: {
  rows: DeadlineRow[];
  canManage: boolean;
  overdue?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className="w-max min-w-full">
        <thead>
          <tr>
            <th>Lhůta</th>
            <th>Typ</th>
            <th>Spis</th>
            <th>Termín</th>
            <th>Odpovědný</th>
            {canManage ? <th>Akce</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((deadline) => (
            <tr key={deadline.id}>
              <td className="font-medium text-stone-950">{deadline.title}</td>
              <td>
                <Badge tone={deadlineTypeTone(deadline.type)}>
                  {deadlineTypeLabels[deadline.type]}
                </Badge>
              </td>
              <td>
                <Link href={`/cases/${deadline.case.id}`} className={caseLinkClass}>
                  {deadline.case.name}
                </Link>
              </td>
              <td className={overdue ? "font-semibold text-red-700" : undefined}>
                {formatDateUtc(deadline.dueDate)}
              </td>
              <td>{deadline.responsibleUser?.name ?? "—"}</td>
              {canManage ? (
                <td>
                  <DeadlineFulfilDialog
                    deadline={{
                      id: deadline.id,
                      title: deadline.title,
                      caseName: deadline.case.name,
                      dueDateLabel: formatDateUtc(deadline.dueDate),
                      overdue,
                    }}
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClosedDeadlineTable({
  rows,
  canManage,
  archived,
}: {
  rows: DeadlineRow[];
  canManage: boolean;
  archived: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className="w-max min-w-full">
        <thead>
          <tr>
            <th>Lhůta</th>
            <th>Typ</th>
            <th>Spis</th>
            <th>Termín</th>
            <th>Stav</th>
            <th>Splněno dne</th>
            <th>Splnil(a)</th>
            <th>Poznámka</th>
            {archived ? <th>Archivováno</th> : null}
            {canManage ? <th>Akce</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((deadline) => {
            const fulfilled = deadline.status === DeadlineStatus.COMPLETED;
            return (
              <tr key={deadline.id}>
                <td className="font-medium text-stone-950">{deadline.title}</td>
                <td>
                  <Badge tone={deadlineTypeTone(deadline.type)}>
                    {deadlineTypeLabels[deadline.type]}
                  </Badge>
                </td>
                <td>
                  <Link href={`/cases/${deadline.case.id}`} className={caseLinkClass}>
                    {deadline.case.name}
                  </Link>
                </td>
                <td>{formatDateUtc(deadline.dueDate)}</td>
                <td>
                  <Badge tone={deadlineStatusTone(deadline.status)}>
                    {deadlineStatusLabels[deadline.status]}
                  </Badge>
                </td>
                <td>{fulfilled ? formatDateUtc(deadline.completedAt) : "—"}</td>
                <td>{fulfilled ? (deadline.completedBy?.name ?? "—") : "—"}</td>
                <td className="max-w-xs whitespace-pre-line break-words">
                  {fulfilled ? (deadline.completionNote ?? "—") : "—"}
                </td>
                {archived ? <td>{formatDateUtc(deadline.archivedAt)}</td> : null}
                {canManage ? (
                  <td>
                    {fulfilled ? (
                      archived ? (
                        <ArchivedDeadlineActions deadlineId={deadline.id} />
                      ) : (
                        <FulfilledDeadlineActions deadlineId={deadline.id} />
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ViewTabs({ view }: { view: DeadlineListView }) {
  return (
    <nav aria-label="Zobrazení lhůt" className="flex flex-wrap gap-2">
      {DEADLINE_LIST_VIEWS.map((option) => {
        const current = option === view;
        return (
          <Link
            key={option}
            href={option === "active" ? "/deadlines" : `/deadlines?view=${option}`}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e1822]",
              current
                ? "border-[#0e1822] bg-[#0e1822] text-white"
                : "border-[#dce4e8] bg-white text-[#0e1822] hover:border-[#17A2A2]",
            )}
          >
            {deadlineListViewLabels[option]}
          </Link>
        );
      })}
    </nav>
  );
}

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const params = await searchParams;
  const view = normalizeDeadlineListView(
    Array.isArray(params.view) ? params.view[0] : params.view,
  );
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.deadlines");
  if (accessDenied) {
    return <AccessDenied title="Lhůtník" message={accessDenied} />;
  }

  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DEADLINES);

    const prisma = getPrisma();
    const now = new Date();
    const soon = new Date(
      now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const visibility = deadlineVisibilityWhere(currentUser);
    const activeWhere = deadlineListWhere("active");
    const listDeadlines = (where: Prisma.DeadlineWhereInput, orderBy: Prisma.DeadlineOrderByWithRelationInput) =>
      prisma.deadline.findMany({
        where: andWhere(where, visibility),
        include: deadlineInclude,
        orderBy,
        take: 500,
      });
    const none = Promise.resolve([] as DeadlineRow[]);

    const [
      overdue,
      upcoming,
      later,
      fulfilled,
      archived,
      hearings,
      cases,
      memberRows,
    ] = await Promise.all([
      view === "active"
        ? listDeadlines({ ...activeWhere, dueDate: { lt: now } }, { dueDate: "asc" })
        : none,
      view === "active"
        ? listDeadlines(
            { ...activeWhere, dueDate: { gte: now, lte: soon } },
            { dueDate: "asc" },
          )
        : none,
      view === "active"
        ? listDeadlines({ ...activeWhere, dueDate: { gt: soon } }, { dueDate: "asc" })
        : none,
      view === "fulfilled"
        ? listDeadlines(deadlineListWhere("fulfilled"), { completedAt: "desc" })
        : none,
      view === "archived"
        ? listDeadlines(deadlineListWhere("archived"), { archivedAt: "desc" })
        : none,
      prisma.courtHearing.findMany({
        where: andWhere(
          { archivedAt: null, hearingAt: { gte: now, lte: soon } },
          courtHearingVisibilityWhere(currentUser),
        ),
        include: hearingInclude,
        orderBy: { hearingAt: "asc" },
        take: 500,
      }),
      prisma.case.findMany({
        where: andWhere(
          { archivedAt: null },
          caseVisibilityWhere(currentUser),
        ),
        orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
        select: { id: true, name: true, project: { select: { name: true } } },
        take: 1000,
      }),
      prisma.organizationMember.findMany({
        where: {
          organizationId: currentUser.organizationId,
          status: "ACTIVE",
        },
        orderBy: { user: { name: "asc" } },
        select: { user: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      view,
      overdue,
      upcoming,
      later,
      fulfilled,
      archived,
      hearings,
      cases,
      members: memberRows.map((row) => row.user),
      canManage: canManageDeadlines(currentUser),
    };
  });

  const data = result.data ?? { ...emptyData, view };

  return (
    <>
      <PageHeader
        title="Lhůtník"
        description="Aktivní lhůty, splněné a archivované lhůty a nadcházející soudní jednání."
        action={
          data.canManage ? (
            <ButtonLink href="/deadlines#new-deadline">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nová lhůta
            </ButtonLink>
          ) : null
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {data.canManage && data.view === "active" ? (
        <Section title="Nová lhůta" id="new-deadline" className="scroll-mt-6">
          <form action={createDeadline} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Případ">
                <SelectInput name="caseId" required>
                  <option value="">Vyberte případ</option>
                  {data.cases.map((legalCase) => (
                    <option key={legalCase.id} value={legalCase.id}>
                      {legalCase.name} / {legalCase.project.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Název lhůty">
                <TextInput name="title" required />
              </Field>
              <Field label="Typ">
                <SelectInput name="type" defaultValue={DeadlineType.PROCEDURAL}>
                  {Object.values(DeadlineType).map((type) => (
                    <option key={type} value={type}>
                      {deadlineTypeLabels[type]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Termín">
                <TextInput name="dueDate" type="date" required />
              </Field>
              <Field label="Odpovědný">
                <SelectInput name="responsibleUserId" defaultValue="">
                  <option value="">Bez přiřazení</option>
                  {data.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Událost počátku">
                <TextInput name="originEvent" />
              </Field>
              <Field label="Datum počátku">
                <TextInput name="originDate" type="date" />
              </Field>
              <Field label="Pravidlo výpočtu">
                <TextInput name="computedRule" />
              </Field>
            </div>
            <Field label="Poznámka">
              <TextArea name="note" />
            </Field>
            <div>
              <Button type="submit" pendingLabel="Vytvářím…">Vytvořit lhůtu</Button>
            </div>
          </form>
        </Section>
      ) : null}

      <ViewTabs view={data.view} />

      {data.view === "active" ? (
        <>
          <Section title="Po termínu">
            {data.overdue.length > 0 ? (
              <ActiveDeadlineTable rows={data.overdue} canManage={data.canManage} overdue />
            ) : (
              <EmptyState>Žádné lhůty po termínu.</EmptyState>
            )}
          </Section>

          <Section title={`Blíží se (do ${UPCOMING_WINDOW_DAYS} dní)`}>
            {data.upcoming.length > 0 ? (
              <ActiveDeadlineTable rows={data.upcoming} canManage={data.canManage} />
            ) : (
              <EmptyState>Žádné lhůty v nejbližších dnech.</EmptyState>
            )}
          </Section>

          <Section title="Později">
            {data.later.length > 0 ? (
              <ActiveDeadlineTable rows={data.later} canManage={data.canManage} />
            ) : (
              <EmptyState>Žádné další naplánované lhůty.</EmptyState>
            )}
          </Section>
        </>
      ) : null}

      {data.view === "fulfilled" ? (
        <Section title="Splněné lhůty">
          {data.fulfilled.length > 0 ? (
            <ClosedDeadlineTable
              rows={data.fulfilled}
              canManage={data.canManage}
              archived={false}
            />
          ) : (
            <EmptyState>Zatím žádné splněné lhůty.</EmptyState>
          )}
        </Section>
      ) : null}

      {data.view === "archived" ? (
        <Section title="Archiv lhůt">
          {data.archived.length > 0 ? (
            <ClosedDeadlineTable
              rows={data.archived}
              canManage={data.canManage}
              archived
            />
          ) : (
            <EmptyState>Archiv je prázdný.</EmptyState>
          )}
        </Section>
      ) : null}

      {data.view === "active" ? (
      <Section title={`Nadcházející soudní jednání (do ${UPCOMING_WINDOW_DAYS} dní)`}>
        {data.hearings.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Soud</th>
                  <th>Spis</th>
                  <th>Termín</th>
                  <th>Místnost</th>
                  <th>Odpovědný</th>
                </tr>
              </thead>
              <tbody>
                {data.hearings.map((hearing) => (
                  <tr key={hearing.id}>
                    <td className="font-medium text-stone-950">{hearing.court}</td>
                    <td>
                      <Link href={`/cases/${hearing.case.id}`} className={caseLinkClass}>
                        {hearing.case.name}
                      </Link>
                    </td>
                    <td>{formatDateTimeUtc(hearing.hearingAt)}</td>
                    <td>{hearing.room ?? "—"}</td>
                    <td>{hearing.responsibleUser?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Žádná nadcházející jednání.</EmptyState>
        )}
      </Section>
      ) : null}
    </>
  );
}
