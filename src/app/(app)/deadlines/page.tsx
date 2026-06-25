import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { DeadlineStatus, ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatDateTime, formatDateUtc } from "@/lib/format";
import { deadlineTypeLabels } from "@/lib/labels";
import {
  andWhere,
  courtHearingVisibilityWhere,
  deadlineVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { deadlineTypeTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

const UPCOMING_WINDOW_DAYS = 30;

const deadlineInclude = {
  case: { select: { id: true, name: true } },
  responsibleUser: { select: { name: true } },
} satisfies Prisma.DeadlineInclude;

const hearingInclude = {
  case: { select: { id: true, name: true } },
  responsibleUser: { select: { name: true } },
} satisfies Prisma.CourtHearingInclude;

type DeadlineRow = Prisma.DeadlineGetPayload<{ include: typeof deadlineInclude }>;
type HearingRow = Prisma.CourtHearingGetPayload<{ include: typeof hearingInclude }>;

type Data = {
  overdue: DeadlineRow[];
  upcoming: DeadlineRow[];
  hearings: HearingRow[];
};

const emptyData: Data = { overdue: [], upcoming: [], hearings: [] };

function deadlineRows(rows: DeadlineRow[]) {
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
                <Link
                  href={`/cases/${deadline.case.id}`}
                  className="text-[#072924] underline-offset-2 hover:underline"
                >
                  {deadline.case.name}
                </Link>
              </td>
              <td>{formatDateUtc(deadline.dueDate)}</td>
              <td>{deadline.responsibleUser?.name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DeadlinesPage() {
  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DEADLINES);

    const prisma = getPrisma();
    const now = new Date();
    const soon = new Date(
      now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [overdue, upcoming, hearings] = await Promise.all([
      prisma.deadline.findMany({
        where: andWhere(
          {
            archivedAt: null,
            status: DeadlineStatus.OPEN,
            dueDate: { lt: now },
          },
          deadlineVisibilityWhere(currentUser),
        ),
        include: deadlineInclude,
        orderBy: { dueDate: "asc" },
        take: 500,
      }),
      prisma.deadline.findMany({
        where: andWhere(
          {
            archivedAt: null,
            status: DeadlineStatus.OPEN,
            dueDate: { gte: now, lte: soon },
          },
          deadlineVisibilityWhere(currentUser),
        ),
        include: deadlineInclude,
        orderBy: { dueDate: "asc" },
        take: 500,
      }),
      prisma.courtHearing.findMany({
        where: andWhere(
          { archivedAt: null, hearingAt: { gte: now, lte: soon } },
          courtHearingVisibilityWhere(currentUser),
        ),
        include: hearingInclude,
        orderBy: { hearingAt: "asc" },
        take: 500,
      }),
    ]);

    return { overdue, upcoming, hearings };
  });

  const data = result.data ?? emptyData;

  return (
    <>
      <PageHeader
        title="Lhůtník"
        description="Lhůty po termínu, blížící se lhůty a nadcházející soudní jednání."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <Section title="Po termínu">
        {data.overdue.length > 0 ? (
          deadlineRows(data.overdue)
        ) : (
          <EmptyState>Žádné lhůty po termínu.</EmptyState>
        )}
      </Section>

      <Section title={`Blíží se (do ${UPCOMING_WINDOW_DAYS} dní)`}>
        {data.upcoming.length > 0 ? (
          deadlineRows(data.upcoming)
        ) : (
          <EmptyState>Žádné lhůty v nejbližších dnech.</EmptyState>
        )}
      </Section>

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
                      <Link
                        href={`/cases/${hearing.case.id}`}
                        className="text-[#072924] underline-offset-2 hover:underline"
                      >
                        {hearing.case.name}
                      </Link>
                    </td>
                    <td>{formatDateTime(hearing.hearingAt)}</td>
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
    </>
  );
}
