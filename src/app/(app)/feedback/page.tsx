import Link from "next/link";

import {
  archiveWorkFeedback,
  updateWorkFeedback,
} from "@/app/actions/work-feedback";
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { RichEntryRowActions } from "@/components/rich-entry-forms";
import { RichText } from "@/components/rich-text";
import { Section } from "@/components/section";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkFeedbackForm } from "@/components/work-feedback-form";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDateTime, formatDateUtc, formatHours } from "@/lib/format";
import { moduleAccessDenial } from "@/lib/module-access.server";
import { getOrgUserOptions } from "@/lib/org-users";
import {
  andWhere,
  canEditAuthoredEntry,
  canViewAllWorkFeedback,
  taskVisibilityWhere,
  workFeedbackVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { firstParam } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import {
  WORK_FEEDBACK_VIEWS,
  feedbackLinksFor,
  workFeedbackViewLabels,
  workFeedbackViewValue,
  workFeedbackViewWhere,
  workLogOptionLabel,
  type FeedbackLinkTarget,
  type FeedbackLinkView,
  type FeedbackPickOption,
  type WorkFeedbackView,
} from "@/lib/work-feedback";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 200;

const listTitles: Record<WorkFeedbackView, string> = {
  all: "Zpětná vazba",
  received: "Zpětná vazba pro mě",
  given: "Zpětná vazba ode mě",
};
const PICK_LIMIT = 300;

type FeedbackPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type FeedbackRow = {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  author: { name: string } | null;
  recipient: { name: string };
  links: FeedbackLinkView[];
  canEdit: boolean;
};

type FeedbackPageData = {
  rows: FeedbackRow[];
  recipients: Array<{ id: string; name: string }>;
  taskOptions: FeedbackPickOption[];
  workLogOptions: FeedbackPickOption[];
  seesAll: boolean;
};

const emptyData: FeedbackPageData = {
  rows: [],
  recipients: [],
  taskOptions: [],
  workLogOptions: [],
  seesAll: false,
};

function workLogLabel(workLog: {
  workDate: Date;
  hours: Parameters<typeof formatHours>[0];
  description: string | null;
  user: { name: string } | null;
}) {
  return workLogOptionLabel({
    workDateLabel: formatDateUtc(workLog.workDate),
    hoursLabel: `${formatHours(workLog.hours)} h`,
    userName: workLog.user?.name ?? null,
    description: workLog.description,
  });
}

async function loadFeedbackPage(view: WorkFeedbackView): Promise<FeedbackPageData> {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();

  const [feedback, users, tasks, workLogs] = await Promise.all([
    prisma.workFeedback.findMany({
      where: andWhere(
        { archivedAt: null },
        workFeedbackVisibilityWhere(currentUser),
        workFeedbackViewWhere(view, currentUser.id),
      ),
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: {
        id: true,
        organizationId: true,
        authorId: true,
        body: true,
        createdAt: true,
        editedAt: true,
        taskId: true,
        workLogId: true,
        author: { select: { name: true } },
        recipient: { select: { name: true } },
      },
    }),
    getOrgUserOptions(currentUser),
    // Nabídka odkazů: jen úkoly a výkazy, které autor sám vidí.
    prisma.task.findMany({
      where: andWhere({ archivedAt: null }, taskVisibilityWhere(currentUser)),
      orderBy: { updatedAt: "desc" },
      take: PICK_LIMIT,
      select: {
        id: true,
        title: true,
        createdById: true,
        assignedToId: true,
        responsibleUserId: true,
        assignees: { select: { userId: true } },
      },
    }),
    prisma.workLog.findMany({
      where: andWhere({ archivedAt: null }, workLogVisibilityWhere(currentUser)),
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: PICK_LIMIT,
      select: {
        id: true,
        userId: true,
        workDate: true,
        hours: true,
        description: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  // Odkazy v seznamu: název/popis jen u záznamů, které čtenář smí vidět.
  const linkedTaskIds = [
    ...new Set(feedback.flatMap((row) => (row.taskId ? [row.taskId] : []))),
  ];
  const linkedWorkLogIds = [
    ...new Set(feedback.flatMap((row) => (row.workLogId ? [row.workLogId] : []))),
  ];
  const [visibleTasks, visibleWorkLogs] = await Promise.all([
    linkedTaskIds.length > 0
      ? prisma.task.findMany({
          where: andWhere(
            { id: { in: linkedTaskIds } },
            taskVisibilityWhere(currentUser),
          ),
          select: { id: true, title: true },
        })
      : [],
    linkedWorkLogIds.length > 0
      ? prisma.workLog.findMany({
          where: andWhere(
            { id: { in: linkedWorkLogIds } },
            workLogVisibilityWhere(currentUser),
          ),
          select: {
            id: true,
            workDate: true,
            hours: true,
            description: true,
            user: { select: { name: true } },
          },
        })
      : [],
  ]);
  const taskTargets = new Map<string, FeedbackLinkTarget>(
    visibleTasks.map((task) => [task.id, { id: task.id, label: task.title }]),
  );
  const workLogTargets = new Map<string, FeedbackLinkTarget>(
    visibleWorkLogs.map((log) => [log.id, { id: log.id, label: workLogLabel(log) }]),
  );

  return {
    rows: feedback.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      author: row.author,
      recipient: row.recipient,
      links: feedbackLinksFor(row, taskTargets, workLogTargets),
      canEdit: canEditAuthoredEntry(currentUser, row),
    })),
    recipients: users.filter((user) => user.id !== currentUser.id),
    taskOptions: tasks.map((task) => ({
      id: task.id,
      label: task.title,
      userIds: [
        task.createdById,
        task.assignedToId,
        task.responsibleUserId,
        ...task.assignees.map((row) => row.userId),
      ].filter((id): id is string => Boolean(id)),
    })),
    workLogOptions: workLogs.map((log) => ({
      id: log.id,
      label: workLogLabel(log),
      userIds: log.userId ? [log.userId] : [],
    })),
    seesAll: canViewAllWorkFeedback(currentUser),
  };
}

function ViewTabs({ view }: { view: WorkFeedbackView }) {
  return (
    <nav aria-label="Zobrazení zpětné vazby" className="flex flex-wrap gap-2">
      {WORK_FEEDBACK_VIEWS.map((option) => {
        const current = option === view;
        return (
          <Link
            key={option}
            href={option === "all" ? "/feedback" : `/feedback?view=${option}`}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e1822]",
              current
                ? "border-[#0e1822] bg-[#0e1822] text-white"
                : "border-[#dce4e8] bg-white text-[#0e1822] hover:border-[#17A2A2]",
            )}
          >
            {workFeedbackViewLabels[option]}
          </Link>
        );
      })}
    </nav>
  );
}

function FeedbackLinks({ links }: { links: FeedbackLinkView[] }) {
  if (links.length === 0) {
    return <>—</>;
  }
  return (
    <ul className="grid gap-1">
      {links.map((link, index) => (
        <li key={index}>
          {link.kind === "hidden" ? (
            <span className="text-[#566673]">{link.label}</span>
          ) : (
            <>
              <span className="text-xs text-[#566673]">
                {link.kind === "task" ? "Úkol: " : "Výkaz: "}
              </span>
              <Link
                href={link.href}
                className="font-medium text-emerald-950 hover:underline"
              >
                {link.label}
              </Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.workLogs");
  if (accessDenied) {
    return <AccessDenied title="Zpětná vazba" message={accessDenied} />;
  }

  const params = await searchParams;
  const view = workFeedbackViewValue(firstParam(params, "view"));
  const result = await safeQuery(emptyData, () => loadFeedbackPage(view));
  const { rows, recipients, taskOptions, workLogOptions, seesAll } = result.data;

  return (
    <>
      <PageHeader
        title="Zpětná vazba"
        description={
          seesAll
            ? "Zpětná vazba kolegů k dosavadní práci. Jako partner/administrátor vidíte zpětnou vazbu celé kanceláře."
            : "Zpětná vazba kolegů k dosavadní práci. Vidíte jen tu, kterou jste napsali, nebo která byla určena vám."
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <ViewTabs view={view} />
      <Section title="Přidat zpětnou vazbu">
        <WorkFeedbackForm
          recipients={recipients}
          tasks={taskOptions}
          workLogs={workLogOptions}
        />
        <p className="mt-3 text-xs text-[#566673]">
          Zpětnou vazbu uvidí jen příjemce, vy a partneři kanceláře.
        </p>
      </Section>
      <Section title={listTitles[view]}>
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="w-full min-w-[48rem] table-auto">
              <thead>
                <tr>
                  <th className="w-40">Datum</th>
                  <th className="w-36">Od</th>
                  <th className="w-36">Pro</th>
                  <th className="w-56">Odkaz</th>
                  <th>Zpětná vazba</th>
                  <th className="w-48">
                    <span className="sr-only">Akce</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="align-top whitespace-nowrap">
                      {formatDateTime(row.createdAt)}
                      {row.editedAt ? (
                        <span
                          className="block text-xs text-[#566673]"
                          title={`Upraveno ${formatDateTime(row.editedAt)}`}
                        >
                          upraveno
                        </span>
                      ) : null}
                    </td>
                    <td className="align-top">{row.author?.name ?? "—"}</td>
                    <td className="align-top">{row.recipient.name}</td>
                    <td className="align-top">
                      <FeedbackLinks links={row.links} />
                    </td>
                    <td className="align-top">
                      <RichText value={row.body} className="max-w-2xl" />
                    </td>
                    <td className="align-top">
                      {row.canEdit ? (
                        <RichEntryRowActions
                          id={row.id}
                          body={row.body}
                          updateAction={updateWorkFeedback}
                          archiveAction={archiveWorkFeedback}
                          editTitle="Upravit zpětnou vazbu"
                          archiveMessage="Zpětná vazba zmizí ze seznamu (archivuje se a zůstane v audit logu)."
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>
            {view === "received"
              ? "Zatím vám nikdo zpětnou vazbu nenapsal."
              : view === "given"
                ? "Zatím jste nikomu zpětnou vazbu nenapsali."
                : "Zatím tu není žádná zpětná vazba."}
          </EmptyState>
        )}
      </Section>
    </>
  );
}
