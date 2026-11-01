import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/access-denied";
import { ArchiveNotice } from "@/components/archive-notice";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatCaseLabel, formatDateUtc, formatHours, formatMoney } from "@/lib/format";
import {
  approvalStatusLabels,
  billingStatusLabels,
  internalTaskCategoryLabels,
} from "@/lib/labels";
import { moduleAccessDenial } from "@/lib/module-access.server";
import {
  andWhere,
  canEditRecord,
  canViewRates,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { billingStatusTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type WorkLogDetailProps = {
  params: Promise<{ id: string }>;
};

// Detail výkazu práce jen ke čtení (cíl odkazů ze zpětné vazby). Úpravy
// zůstávají na /work-logs/[id]/edit pro toho, kdo výkaz smí upravit.
async function loadWorkLog(id: string) {
  const currentUser = await getCurrentUser();
  const workLog = await getPrisma().workLog.findFirst({
    where: andWhere({ id }, workLogVisibilityWhere(currentUser)),
    select: {
      id: true,
      organizationId: true,
      userId: true,
      workDate: true,
      hours: true,
      amountCzk: true,
      description: true,
      billingStatus: true,
      approvalStatus: true,
      legalArea: true,
      internalCategory: true,
      archivedAt: true,
      user: { select: { name: true } },
      subject: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      case: { select: { id: true, name: true, fileNumber: true } },
      task: { select: { id: true, title: true } },
    },
  });
  return {
    workLog,
    canEdit: workLog ? canEditRecord(currentUser, "WorkLog", workLog) : false,
  };
}

type WorkLogDetailData = Awaited<ReturnType<typeof loadWorkLog>>;

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-stone-500">{label}</p>
      <div>{children}</div>
    </div>
  );
}

const linkClass = "font-medium text-emerald-950 hover:underline";

export default async function WorkLogDetailPage({ params }: WorkLogDetailProps) {
  const accessUser = await getCurrentUser();
  const accessDenied = await moduleAccessDenial(accessUser, "module.workLogs");
  if (accessDenied) {
    return <AccessDenied title="Výkazy práce" message={accessDenied} />;
  }
  const showRates = canViewRates(accessUser);

  const { id } = await params;
  const result = await safeQuery<WorkLogDetailData>(
    { workLog: null, canEdit: false },
    () => loadWorkLog(id),
  );
  if (result.databaseReady && !result.data.workLog) {
    notFound();
  }
  const { workLog, canEdit } = result.data;

  return (
    <>
      <PageHeader
        title="Detail výkazu práce"
        description={
          workLog
            ? `${formatDateUtc(workLog.workDate)} · ${workLog.user?.name ?? "—"}`
            : undefined
        }
        action={
          <>
            {workLog && canEdit ? (
              <ButtonLink href={`/work-logs/${workLog.id}/edit`}>Upravit výkaz</ButtonLink>
            ) : null}
            <ButtonLink href="/work-logs" variant="secondary">
              Zpět na výkazy
            </ButtonLink>
          </>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <ArchiveNotice archivedAt={workLog?.archivedAt ?? null} />
      {workLog ? (
        <Section>
          <div className="grid gap-4 md:grid-cols-3">
            <Item label="Datum">{formatDateUtc(workLog.workDate)}</Item>
            <Item label="Pracovník">{workLog.user?.name ?? "—"}</Item>
            <Item label="Hodiny">{formatHours(workLog.hours)} h</Item>
            <Item label="Klient">
              {workLog.subject ? (
                <Link href={`/subjects/${workLog.subject.id}`} className={linkClass}>
                  {workLog.subject.name}
                </Link>
              ) : (
                "—"
              )}
            </Item>
            <Item label="Projekt">
              {workLog.project ? (
                <Link href={`/projects/${workLog.project.id}`} className={linkClass}>
                  {workLog.project.name}
                </Link>
              ) : (
                "—"
              )}
            </Item>
            <Item label="Případ">
              {workLog.case ? (
                <Link href={`/cases/${workLog.case.id}`} className={linkClass}>
                  {formatCaseLabel(workLog.case)}
                </Link>
              ) : (
                "—"
              )}
            </Item>
            <Item label="Úkol">
              {workLog.task ? (
                <Link href={`/tasks/${workLog.task.id}`} className={linkClass}>
                  {workLog.task.title}
                </Link>
              ) : (
                "—"
              )}
            </Item>
            <Item label="Fakturace">
              <Badge tone={billingStatusTone(workLog.billingStatus)}>
                {billingStatusLabels[workLog.billingStatus]}
              </Badge>
            </Item>
            <Item label="Schválení">{approvalStatusLabels[workLog.approvalStatus]}</Item>
            <Item label={workLog.internalCategory ? "Kategorie" : "Právní oblast"}>
              {workLog.internalCategory
                ? internalTaskCategoryLabels[workLog.internalCategory]
                : workLog.legalArea ?? "—"}
            </Item>
            {showRates ? (
              <Item label="Částka">{formatMoney(workLog.amountCzk)}</Item>
            ) : null}
            <div className="md:col-span-3">
              <Item label="Popis">
                <p className="whitespace-pre-wrap">{workLog.description ?? "—"}</p>
              </Item>
            </div>
          </div>
        </Section>
      ) : (
        <EmptyState>Detail výkazu není dostupný bez databáze.</EmptyState>
      )}
    </>
  );
}
