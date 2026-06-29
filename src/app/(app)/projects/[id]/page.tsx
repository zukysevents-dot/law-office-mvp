import Link from "next/link";
import { notFound } from "next/navigation";

import { archiveProject, restoreProject } from "@/app/actions/projects";
import { addProjectSubjectRelation } from "@/app/actions/subject-relations";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { ArchiveNotice } from "@/components/archive-notice";
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
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import {
  options,
  projectStatusLabels,
  subjectRoleLabels,
  taskStatusLabels,
} from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import {
  andWhere,
  canViewAllLegalData,
  canEditRecord,
  caseVisibilityWhere,
  projectVisibilityWhere,
  referenceVisibilityWhere,
  subjectVisibilityWhere,
  taskVisibilityWhere,
  workLogVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { subjectRoleTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type ProjectDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sharepoint?: string }>;
};

async function loadProject(id: string) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();

  const [project, subjects] = await Promise.all([
    prisma.project.findFirst({
      where: andWhere({ id }, projectVisibilityWhere(currentUser)),
      include: {
        mainSubject: { select: { id: true, name: true, ico: true } },
        responsibleUser: { select: { name: true } },
        subjectRelations: {
          orderBy: { createdAt: "desc" },
          include: {
            subject: { select: { id: true, name: true, ico: true } },
            case: { select: { id: true, name: true, fileNumber: true } },
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
            case: { select: { id: true, name: true, fileNumber: true } },
            subject: { select: { id: true, name: true } },
          },
        },
        cases: {
          where: andWhere(
            { archivedAt: null },
            caseVisibilityWhere(currentUser),
          ),
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, fileNumber: true, status: true },
        },
        tasks: {
          where: andWhere(
            { archivedAt: null },
            taskVisibilityWhere(currentUser),
          ),
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            deadline: true,
            assignedTo: { select: { name: true } },
          },
        },
        workLogs: {
          where: andWhere(
            { archivedAt: null },
            workLogVisibilityWhere(currentUser),
          ),
          orderBy: { workDate: "desc" },
          take: 10,
          select: {
            id: true,
            workDate: true,
            hours: true,
            description: true,
            user: { select: { name: true } },
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
      select: { id: true, name: true, ico: true },
    }),
  ]);

  return {
    project,
    subjects,
    canArchive: canViewAllLegalData(currentUser),
    canEdit: project ? canEditRecord(currentUser, "Project", project) : false,
  };
}

type ProjectDetailData = Awaited<ReturnType<typeof loadProject>>;

const emptyProjectDetail: ProjectDetailData = {
  project: null,
  subjects: [],
  canArchive: false,
  canEdit: false,
};

export default async function ProjectDetailPage({
  params,
  searchParams,
}: ProjectDetailProps) {
  const { id } = await params;
  const { sharepoint } = await searchParams;
  const result = await safeQuery<ProjectDetailData>(
    emptyProjectDetail,
    () => loadProject(id),
  );

  if (result.databaseReady && !result.data.project) {
    notFound();
  }

  const { project, subjects, canArchive, canEdit } = result.data;

  return (
    <>
      <PageHeader
        title={project?.name ?? "Detail projektu"}
        description="Projektový kontext, případy, úkoly, reference a poslední výkazy práce."
        action={
          project ? (
            <>
              <ButtonLink
                href={`/cases?projectId=${project.id}#new-case`}
                variant="secondary"
              >
                Nový případ
              </ButtonLink>
              <ButtonLink
                href={`/tasks?projectId=${project.id}#new-task`}
                variant="secondary"
              >
                Nový úkol
              </ButtonLink>
              {canEdit ? (
                <ButtonLink href={`/projects/${project.id}/edit`}>
                  Upravit projekt
                </ButtonLink>
              ) : null}
              {canArchive ? (
                <ArchiveActionForm
                  action={project.archivedAt ? restoreProject : archiveProject}
                  id={project.id}
                  mode={project.archivedAt ? "restore" : "archive"}
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
      <ArchiveNotice archivedAt={project?.archivedAt ?? null} />
      <SharepointNotice status={sharepoint} />
      {project ? (
        <>
          <Section>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">Stav</p>
                <Badge tone="green">{projectStatusLabels[project.status]}</Badge>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Klient
                </p>
                <Link
                  href={`/subjects/${project.mainSubject.id}`}
                  className="font-medium text-emerald-950 hover:underline"
                >
                  {project.mainSubject.name}
                </Link>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Odpovědný
                </p>
                <p>{project.responsibleUser?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Hodinová sazba projektu
                </p>
                <p>{formatMoney(project.hourlyRate)}</p>
              </div>
              <SharepointFolderField
                entityType="Project"
                id={project.id}
                url={project.sharepointUrl}
                canEdit={canEdit}
              />
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Poznámka
                </p>
                <p className="whitespace-pre-wrap">{project.note ?? "—"}</p>
              </div>
            </div>
          </Section>
          <Section title="Subjektové vazby projektu">
            {project.subjectRelations.length > 0 ? (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Subjekt</th>
                      <th>IČO</th>
                      <th>Role</th>
                      <th>Případ</th>
                      <th>Poznámka</th>
                      <th>Vytvořeno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.subjectRelations.map((relation) => (
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
                        <td>
                          {relation.case
                            ? `${relation.case.name}${
                                relation.case.fileNumber
                                  ? `, ${relation.case.fileNumber}`
                                  : ""
                              }`
                            : "—"}
                        </td>
                        <td>{relation.note ?? "—"}</td>
                        <td>{formatDate(relation.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Projekt zatím nemá další subjektové vazby.</EmptyState>
            )}
          </Section>
          {canEdit ? (
            <Section title="Přidat subjekt k projektu">
              <form action={addProjectSubjectRelation} className="grid gap-4">
                <input type="hidden" name="projectId" value={project.id} />
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
          <Section title="Reference projektu">
            {project.references.length > 0 ? (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Název</th>
                      <th>Právní odvětví</th>
                      <th>Hodnota</th>
                      <th>Období</th>
                      <th>Případ</th>
                      <th>Popis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.references.map((reference) => (
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
                        <td>{reference.case?.name ?? "—"}</td>
                        <td className="max-w-md">{reference.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Projekt zatím nemá reference.</EmptyState>
            )}
          </Section>
          {canEdit ? (
            <Section title="Přidat referenci k projektu">
              <ReferenceForm
                returnTo={`/projects/${project.id}`}
                fixedProjectId={project.id}
                fixedSubjectId={project.mainSubject.id}
              />
            </Section>
          ) : null}
          <Section title="Případy">
            {project.cases.length > 0 ? (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Název</th>
                      <th>Spisová značka</th>
                      <th>Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.cases.map((legalCase) => (
                      <tr key={legalCase.id}>
                        <td>
                          <Link
                            href={`/cases/${legalCase.id}`}
                            className="font-medium text-emerald-950 hover:underline"
                          >
                            {legalCase.name}
                          </Link>
                        </td>
                        <td>{legalCase.fileNumber ?? "—"}</td>
                        <td>{legalCase.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Projekt zatím nemá založené případy.</EmptyState>
            )}
          </Section>
          <Section title="Poslední úkoly">
            {project.tasks.length > 0 ? (
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
                    {project.tasks.map((task) => (
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
              <EmptyState>Projekt zatím nemá úkoly.</EmptyState>
            )}
          </Section>
          <Section title="Poslední výkazy práce">
            {project.workLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Uživatel</th>
                      <th>Hodiny</th>
                      <th>Popis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.workLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDate(log.workDate)}</td>
                        <td>{log.user?.name ?? "—"}</td>
                        <td>{formatHours(log.hours)}</td>
                        <td>{log.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Projekt zatím nemá výkazy práce.</EmptyState>
            )}
          </Section>
        </>
      ) : (
        <EmptyState>Detail projektu není dostupný bez databáze.</EmptyState>
      )}
    </>
  );
}
