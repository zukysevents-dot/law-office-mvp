import Link from "next/link";
import { notFound } from "next/navigation";

import { archiveCase, restoreCase } from "@/app/actions/cases";
import { shareCase } from "@/app/actions/portal";
import { addCaseSubjectRelation } from "@/app/actions/subject-relations";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { ArchiveNotice } from "@/components/archive-notice";
import { CaseDeadlinesSection } from "@/components/case-deadlines-section";
import { CaseDocumentsSection } from "@/components/case-documents-section";
import { Field, SelectInput, TextArea } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { ReferenceForm } from "@/components/reference-form";
import { Section } from "@/components/section";
import { SharepointFolderField } from "@/components/sharepoint-folder-field";
import { SharepointNotice } from "@/components/sharepoint-notice";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/entitlements";
import { formatDate, formatMoney } from "@/lib/format";
import {
  caseStatusLabels,
  options,
  subjectRoleLabels,
  taskStatusLabels,
} from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import {
  andWhere,
  canManageDeadlines,
  canManageDocuments,
  canManagePortal,
  canViewAllLegalData,
  canEditRecord,
  caseVisibilityWhere,
  courtHearingVisibilityWhere,
  deadlineVisibilityWhere,
  documentTemplateVisibilityWhere,
  documentVisibilityWhere,
  referenceVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { LIST_QUERY_LIMIT } from "@/lib/query-limits";
import { subjectRoleTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type CaseDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sharepoint?: string }>;
};

async function loadCase(id: string) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();

  const [legalCase, subjects] = await Promise.all([
    prisma.case.findFirst({
      where: andWhere({ id }, caseVisibilityWhere(currentUser)),
      include: {
        project: {
          select: {
            id: true,
            name: true,
            mainSubject: { select: { id: true, name: true } },
          },
        },
        responsibleUser: { select: { name: true } },
        subjectRelations: {
          orderBy: { createdAt: "desc" },
          include: {
            subject: { select: { id: true, name: true, ico: true } },
            createdBy: { select: { name: true } },
          },
        },
        references: {
          where: andWhere(
            { archivedAt: null },
            referenceVisibilityWhere(currentUser),
          ),
          orderBy: [{ endDate: "asc" }, { startDate: "desc" }],
          include: {
            project: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true } },
          },
        },
        tasks: {
          where: andWhere(
            { archivedAt: null },
            taskVisibilityWhere(currentUser),
          ),
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            status: true,
            deadline: true,
            assignedTo: { select: { name: true } },
          },
        },
      },
    }),
    prisma.subject.findMany({
      where: andWhere(
        { archivedAt: null },
        subjectVisibilityWhere(currentUser),
      ),
      orderBy: { name: "asc" },
      take: LIST_QUERY_LIMIT,
      select: { id: true, name: true, ico: true },
    }),
  ]);

  const deadlinesEnabled =
    legalCase != null &&
    (await isModuleEnabled(currentUser.organizationId, ModuleKey.DEADLINES));

  const [deadlines, hearings, memberRows] = deadlinesEnabled
    ? await Promise.all([
        prisma.deadline.findMany({
          where: andWhere(
            { caseId: id, archivedAt: null },
            deadlineVisibilityWhere(currentUser),
          ),
          orderBy: { dueDate: "asc" },
          take: 200,
          select: {
            id: true,
            type: true,
            status: true,
            title: true,
            dueDate: true,
            responsibleUser: { select: { name: true } },
          },
        }),
        prisma.courtHearing.findMany({
          where: andWhere(
            { caseId: id, archivedAt: null },
            courtHearingVisibilityWhere(currentUser),
          ),
          orderBy: { hearingAt: "asc" },
          take: 200,
          select: {
            id: true,
            court: true,
            hearingAt: true,
            room: true,
            responsibleUser: { select: { name: true } },
          },
        }),
        prisma.organizationMember.findMany({
          where: {
            organizationId: currentUser.organizationId ?? undefined,
            status: "ACTIVE",
          },
          orderBy: { user: { name: "asc" } },
          take: LIST_QUERY_LIMIT,
          select: { user: { select: { id: true, name: true } } },
        }),
      ])
    : [[], [], []];

  const documentsEnabled =
    legalCase != null &&
    (await isModuleEnabled(currentUser.organizationId, ModuleKey.DOCUMENTS));

  const [documents, templates] = documentsEnabled
    ? await Promise.all([
        prisma.document.findMany({
          where: andWhere(
            { caseId: id, archivedAt: null },
            documentVisibilityWhere(currentUser),
          ),
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            kind: true,
            name: true,
            storageUrl: true,
            currentVersion: { select: { version: true } },
          },
        }),
        prisma.documentTemplate.findMany({
          where: andWhere(
            { archivedAt: null, active: true },
            documentTemplateVisibilityWhere(currentUser),
          ),
          orderBy: { name: "asc" },
          take: 200,
          select: { id: true, name: true },
        }),
      ])
    : [[], []];

  const canShareToPortal =
    legalCase != null &&
    canManagePortal(currentUser) &&
    (await isModuleEnabled(currentUser.organizationId, ModuleKey.CLIENT_PORTAL));
  const portalTargets = canShareToPortal
    ? await prisma.portalAccess.findMany({
        where: {
          organizationId: currentUser.organizationId ?? undefined,
          status: "ACTIVE",
        },
        orderBy: { subject: { name: "asc" } },
        take: LIST_QUERY_LIMIT,
        select: { id: true, subject: { select: { name: true } } },
      })
    : [];

  return {
    legalCase,
    subjects,
    canArchive: canViewAllLegalData(currentUser),
    canEdit: legalCase ? canEditRecord(currentUser, "Case", legalCase) : false,
    deadlinesEnabled,
    deadlines,
    hearings,
    members: memberRows.map((row) => row.user),
    canManageDeadlines: canManageDeadlines(currentUser),
    documentsEnabled,
    documents,
    templates,
    canManageDocuments: canManageDocuments(currentUser),
    portalTargets,
  };
}

type CaseDetailData = Awaited<ReturnType<typeof loadCase>>;

const emptyCaseDetail: CaseDetailData = {
  legalCase: null,
  subjects: [],
  canArchive: false,
  canEdit: false,
  deadlinesEnabled: false,
  deadlines: [],
  hearings: [],
  members: [],
  canManageDeadlines: false,
  documentsEnabled: false,
  documents: [],
  templates: [],
  canManageDocuments: false,
  portalTargets: [],
};

export default async function CaseDetailPage({
  params,
  searchParams,
}: CaseDetailProps) {
  const { id } = await params;
  const { sharepoint } = await searchParams;
  const result = await safeQuery<CaseDetailData>(
    emptyCaseDetail,
    () => loadCase(id),
  );

  if (result.databaseReady && !result.data.legalCase) {
    notFound();
  }

  const {
    legalCase,
    subjects,
    canArchive,
    canEdit,
    deadlinesEnabled,
    deadlines,
    hearings,
    members,
    canManageDeadlines: canManageDeadlinesFlag,
    documentsEnabled,
    documents,
    templates,
    canManageDocuments: canManageDocumentsFlag,
    portalTargets,
  } = result.data;

  return (
    <>
      <PageHeader
        title={legalCase?.name ?? "Detail případu"}
        description="Případový kontext, role subjektů, reference a související úkoly."
        action={
          legalCase ? (
            <>
              {canEdit ? (
                <ButtonLink href={`/cases/${legalCase.id}/edit`}>
                  Upravit případ
                </ButtonLink>
              ) : null}
              {canArchive ? (
                <ArchiveActionForm
                  action={legalCase.archivedAt ? restoreCase : archiveCase}
                  id={legalCase.id}
                  mode={legalCase.archivedAt ? "restore" : "archive"}
                />
              ) : null}
            </>
          ) : null
        }
      />
      <DatabaseNotice
        databaseReady={result.databaseReady}
        error={result.error}
      />
      <ArchiveNotice archivedAt={legalCase?.archivedAt ?? null} />
      <SharepointNotice status={sharepoint} />
      {legalCase ? (
        <>
          <Section>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">Stav</p>
                <Badge tone="green">{caseStatusLabels[legalCase.status]}</Badge>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Projekt
                </p>
                <Link
                  href={`/projects/${legalCase.project.id}`}
                  className="font-medium text-emerald-950 hover:underline"
                >
                  {legalCase.project.name}
                </Link>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Spisová značka
                </p>
                <p>{legalCase.fileNumber ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Hlavní subjekt projektu
                </p>
                <Link
                  href={`/subjects/${legalCase.project.mainSubject.id}`}
                  className="font-medium text-emerald-950 hover:underline"
                >
                  {legalCase.project.mainSubject.name}
                </Link>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Odpovědný
                </p>
                <p>{legalCase.responsibleUser?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Vytvořeno
                </p>
                <p>{formatDate(legalCase.createdAt)}</p>
              </div>
              <SharepointFolderField
                entityType="Case"
                id={legalCase.id}
                url={legalCase.sharepointUrl}
                canEdit={canEdit}
              />
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Poznámka
                </p>
                <p className="whitespace-pre-wrap">{legalCase.note ?? "—"}</p>
              </div>
            </div>
          </Section>
          <Section title="Role subjektů">
            {legalCase.subjectRelations.length > 0 ? (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Subjekt</th>
                      <th>IČO</th>
                      <th>Role</th>
                      <th>Poznámka</th>
                      <th>Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legalCase.subjectRelations.map((relation) => (
                      <tr key={relation.id}>
                        <td>
                          <Link
                            href={`/subjects/${relation.subject.id}`}
                            className="font-medium text-emerald-950 hover:underline"
                          >
                            {relation.subject.name}
                          </Link>
                        </td>
                        <td>{relation.subject.ico ?? "—"}</td>
                        <td>
                          <Badge tone={subjectRoleTone(relation.role)}>
                            {subjectRoleLabels[relation.role]}
                          </Badge>
                        </td>
                        <td>{relation.note ?? "—"}</td>
                        <td>{formatDate(relation.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Případ zatím nemá role subjektů.</EmptyState>
            )}
          </Section>
          {canEdit ? (
            <Section title="Přidat subjekt k případu">
              <form action={addCaseSubjectRelation} className="grid gap-4">
                <input type="hidden" name="caseId" value={legalCase.id} />
                <input type="hidden" name="projectId" value={legalCase.project.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Subjekt">
                    <SelectInput name="subjectId" required>
                      <option value="">Vyberte subjekt</option>
                      {subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                          {subject.ico ? `, IČO ${subject.ico}` : ""}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Role subjektu">
                    <SelectInput name="role" defaultValue="CLIENT">
                      {options.subjectRoles.map((role) => (
                        <option key={role} value={role}>
                          {subjectRoleLabels[role]}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>
                <Field label="Poznámka">
                  <TextArea name="note" />
                </Field>
                <div>
                  <Button type="submit">Přidat vazbu</Button>
                </div>
              </form>
            </Section>
          ) : null}
          <Section title="Reference případu">
            {legalCase.references.length > 0 ? (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Název</th>
                      <th>Právní odvětví</th>
                      <th>Hodnota</th>
                      <th>Období</th>
                      <th>Subjekt</th>
                      <th>Popis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legalCase.references.map((reference) => (
                      <tr key={reference.id}>
                        <td className="font-medium text-stone-950">
                          {reference.title}
                        </td>
                        <td>{reference.legalArea ?? "—"}</td>
                        <td>{formatMoney(reference.valueCzk)}</td>
                        <td>
                          {formatDate(reference.startDate)} –{" "}
                          {reference.endDate
                            ? formatDate(reference.endDate)
                            : "Probíhající"}
                        </td>
                        <td>{reference.subject?.name ?? "—"}</td>
                        <td className="max-w-md">{reference.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Případ zatím nemá reference.</EmptyState>
            )}
          </Section>
          {canEdit ? (
            <Section title="Přidat referenci k případu">
              <ReferenceForm
                returnTo={`/cases/${legalCase.id}`}
                fixedProjectId={legalCase.project.id}
                fixedCaseId={legalCase.id}
                fixedSubjectId={legalCase.project.mainSubject.id}
              />
            </Section>
          ) : null}
          <Section title="Úkoly případu">
            {legalCase.tasks.length > 0 ? (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Úkol</th>
                      <th>Řešitel</th>
                      <th>Stav</th>
                      <th>Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legalCase.tasks.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <Link
                            href={`/tasks/${task.id}`}
                            className="font-medium text-emerald-950 hover:underline"
                          >
                            {task.title}
                          </Link>
                        </td>
                        <td>{task.assignedTo?.name ?? "—"}</td>
                        <td>{taskStatusLabels[task.status]}</td>
                        <td>{formatDate(task.deadline)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Případ zatím nemá úkoly.</EmptyState>
            )}
          </Section>
          {deadlinesEnabled ? (
            <CaseDeadlinesSection
              caseId={legalCase.id}
              deadlines={deadlines}
              hearings={hearings}
              members={members}
              canManage={canManageDeadlinesFlag}
            />
          ) : null}
          {documentsEnabled ? (
            <CaseDocumentsSection
              caseId={legalCase.id}
              documents={documents}
              templates={templates}
              canManage={canManageDocumentsFlag}
            />
          ) : null}
          {portalTargets.length > 0 ? (
            <Section title="Sdílet spis s klientem">
              <form action={shareCase} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="caseId" value={legalCase.id} />
                <Field label="Klient (portálový přístup)">
                  <SelectInput
                    name="portalAccessId"
                    defaultValue={portalTargets[0].id}
                  >
                    {portalTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.subject.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Button type="submit" variant="secondary">
                  Sdílet spis
                </Button>
              </form>
              <p className="mt-2 text-xs text-stone-400">
                Klient uvidí jen stav a spisovou značku, ne interní poznámky.
              </p>
            </Section>
          ) : null}
        </>
      ) : (
        <EmptyState>Detail případu není dostupný bez databáze.</EmptyState>
      )}
    </>
  );
}
