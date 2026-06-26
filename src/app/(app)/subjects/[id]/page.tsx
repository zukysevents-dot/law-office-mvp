import Link from "next/link";
import { notFound } from "next/navigation";

import type { Prisma } from "@/generated/prisma/client";
import { archiveSubject, restoreSubject } from "@/app/actions/subjects";
import { AresNotice } from "@/components/ares-notice";
import { AresVerifyButton } from "@/components/ares-verify-button";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { ArchiveNotice } from "@/components/archive-notice";
import { CompanyRiskNotice } from "@/components/company-risk-notice";
import { ComposeEmailButton } from "@/components/compose-email-button";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { SharepointFolderField } from "@/components/sharepoint-folder-field";
import { SharepointNotice } from "@/components/sharepoint-notice";
import { SubjectAmlSection } from "@/components/subject-aml-section";
import { SubjectPortalSection } from "@/components/subject-portal-section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/entitlements";
import { formatDate, formatMoney } from "@/lib/format";
import {
  feeTypeLabels,
  projectStatusLabels,
  subjectRoleLabels,
  subjectTypeLabels,
} from "@/lib/labels";
import { safeQuery } from "@/lib/db-safe";
import {
  andWhere,
  canEditRecord,
  canManagePortal,
  canViewAllLegalData,
  caseVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { subjectRoleTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type SubjectDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sharepoint?: string; ares?: string }>;
};

type SubjectProject = {
  id: string;
  name: string;
  status: keyof typeof projectStatusLabels;
  archivedAt: Date | null;
};

type SubjectDetailData = Awaited<ReturnType<typeof loadSubject>>;

function subjectRelationVisibilityWhere(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
): Prisma.SubjectRelationWhereInput {
  if (canViewAllLegalData(user)) {
    return {};
  }

  const projectWhere = projectVisibilityWhere(user);
  const caseWhere = caseVisibilityWhere(user);

  return {
    AND: [
      {
        OR: [
          { project: { is: projectWhere } },
          { case: { is: caseWhere } },
        ],
      },
      {
        OR: [{ projectId: null }, { project: { is: projectWhere } }],
      },
      {
        OR: [{ caseId: null }, { case: { is: caseWhere } }],
      },
    ],
  };
}

async function loadSubject(id: string) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const projectWhere = projectVisibilityWhere(currentUser);
  const relationWhere = subjectRelationVisibilityWhere(currentUser);

  const subject = await prisma.subject.findFirst({
    where: andWhere({ id }, subjectVisibilityWhere(currentUser)),
    include: {
      mainProjects: {
        where: projectWhere,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, status: true, archivedAt: true },
      },
      relations: {
        where: relationWhere,
        orderBy: { createdAt: "desc" },
        include: {
          project: {
            select: { id: true, name: true, status: true, archivedAt: true },
          },
          case: { select: { id: true, name: true, fileNumber: true } },
          createdBy: { select: { name: true } },
        },
      },
      conflictChecks: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { checkedBy: { select: { name: true } } },
      },
    },
  });

  // AML/KYC data is compliance-sensitive — load it only for ADMIN/PARTNER, and
  // never include it in the main subject query a LAWYER can run.
  const canAml = canViewAllLegalData(currentUser);
  let aml: {
    identifications: Awaited<
      ReturnType<typeof prisma.amlIdentification.findMany>
    >;
    assessment: Awaited<ReturnType<typeof prisma.amlAssessment.findUnique>>;
  } | null = null;
  if (canAml && subject) {
    const [identifications, assessment] = await Promise.all([
      prisma.amlIdentification.findMany({
        where: { subjectId: subject.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.amlAssessment.findUnique({ where: { subjectId: subject.id } }),
    ]);
    aml = { identifications, assessment };
  }

  const portalEnabled =
    subject != null &&
    canManagePortal(currentUser) &&
    (await isModuleEnabled(currentUser.organizationId, ModuleKey.CLIENT_PORTAL));

  let portal: {
    access: { id: string; email: string; status: "ACTIVE" | "REVOKED" } | null;
    shares: Array<{
      id: string;
      shareType: "DOCUMENT" | "CASE";
      document: { id: string; name: string } | null;
      case: { id: string; name: string } | null;
    }>;
  } | null = null;

  if (portalEnabled && subject) {
    const access = await prisma.portalAccess.findUnique({
      where: { subjectId: subject.id },
      select: { id: true, email: true, status: true },
    });
    const shares = access
      ? await prisma.portalShare.findMany({
          where: { portalAccessId: access.id, revokedAt: null },
          orderBy: { sharedAt: "desc" },
          select: {
            id: true,
            shareType: true,
            document: { select: { id: true, name: true } },
            case: { select: { id: true, name: true } },
          },
        })
      : [];
    portal = { access, shares };
  }

  return {
    subject,
    canArchive: canViewAllLegalData(currentUser),
    canEdit: subject ? canEditRecord(currentUser, "Subject", subject) : false,
    canAml,
    aml,
    portalEnabled,
    portal,
  };
}

function projectGroups(subject: NonNullable<SubjectDetailData["subject"]>) {
  const map = new Map<string, SubjectProject>();

  for (const project of subject.mainProjects) {
    map.set(project.id, project);
  }

  for (const relation of subject.relations) {
    if (relation.project) {
      map.set(relation.project.id, relation.project);
    }
  }

  const projects = Array.from(map.values());

  return {
    active: projects.filter(
      (project) => project.archivedAt === null && project.status === "ACTIVE",
    ),
    inactive: projects.filter(
      (project) => project.archivedAt !== null || project.status !== "ACTIVE",
    ),
  };
}

function icoLinks(ico: string) {
  return {
    ares: `https://ares.gov.cz/ekonomicke-subjekty?ico=${encodeURIComponent(ico)}`,
    obchodniRejstrik: `https://or.justice.cz/ias/ui/rejstrik-$firma?ico=${encodeURIComponent(ico)}`,
    // ISIR has no stable IČO querystring; link to the official insolvency search.
    isir: "https://isir.justice.cz/isir/common/index.do",
  };
}

export default async function SubjectDetailPage({
  params,
  searchParams,
}: SubjectDetailProps) {
  const { id } = await params;
  const { sharepoint, ares } = await searchParams;
  const result = await safeQuery<SubjectDetailData>(
    {
      subject: null,
      canArchive: false,
      canEdit: false,
      canAml: false,
      aml: null,
      portalEnabled: false,
      portal: null,
    },
    () => loadSubject(id),
  );

  if (result.databaseReady && !result.data.subject) {
    notFound();
  }

  const { subject, canArchive, canEdit, canAml, aml, portalEnabled, portal } =
    result.data;
  const projects = subject ? projectGroups(subject) : { active: [], inactive: [] };
  const links = subject?.ico ? icoLinks(subject.ico) : null;

  return (
    <>
      <PageHeader
        title={subject?.name ?? "Detail subjektu"}
        description="Historie rolí subjektu v projektech a případech."
        action={
          subject ? (
            <>
              {subject.email ? (
                <ComposeEmailButton email={subject.email} subject={subject.name} />
              ) : null}
              {canEdit ? (
                <ButtonLink href={`/subjects/${subject.id}/edit`}>
                  Upravit subjekt
                </ButtonLink>
              ) : null}
              {canArchive ? (
                <ArchiveActionForm
                  action={subject.archivedAt ? restoreSubject : archiveSubject}
                  id={subject.id}
                  mode={subject.archivedAt ? "restore" : "archive"}
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
      <ArchiveNotice archivedAt={subject?.archivedAt ?? null} />
      <SharepointNotice status={sharepoint} />
      <AresNotice status={ares} />
      {subject ? (
        <CompanyRiskNotice
          riskFlag={subject.riskFlag}
          insolvencyStatus={subject.insolvencyStatus}
          isirUrl={links?.isir}
        />
      ) : null}
      {subject ? (
        <>
          <Section>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">Typ</p>
                <p>{subjectTypeLabels[subject.type]}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">IČO</p>
                {subject.ico && links ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={links.ares}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-medium text-emerald-950 hover:underline"
                      >
                        {subject.ico}
                      </a>
                      <a
                        href={links.ares}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-emerald-950 hover:underline"
                      >
                        ARES
                      </a>
                      <a
                        href={links.obchodniRejstrik}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-emerald-950 hover:underline"
                      >
                        Obchodní rejstřík
                      </a>
                      <a
                        href={links.isir}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-emerald-950 hover:underline"
                      >
                        Insolvenční rejstřík
                      </a>
                    </div>
                    {canEdit && subject.type !== "PERSON" ? (
                      <AresVerifyButton subjectId={subject.id} />
                    ) : null}
                    {subject.aresVerifiedAt ? (
                      <p className="text-xs text-stone-500">
                        Ověřeno z ARES: {formatDate(subject.aresVerifiedAt)}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="font-mono">—</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">DIČ</p>
                <p className="font-mono">{subject.dic ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  E-mail
                </p>
                {subject.email ? (
                  <a
                    href={`mailto:${encodeURIComponent(subject.email)}`}
                    className="break-all font-medium text-emerald-950 hover:underline"
                  >
                    {subject.email}
                  </a>
                ) : (
                  <p>—</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">Stav</p>
                <p>{subject.status}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Insolvence
                </p>
                <p>{subject.insolvencyStatus ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">Riziko</p>
                {subject.riskFlag ? (
                  <Badge tone="red">Rizikový subjekt</Badge>
                ) : (
                  <Badge tone="green">Bez příznaku</Badge>
                )}
              </div>
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Adresa
                </p>
                <p>{subject.address ?? "—"}</p>
              </div>
              <SharepointFolderField
                entityType="Subject"
                id={subject.id}
                url={subject.sharepointUrl}
                canEdit={canEdit}
              />
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Interní poznámka
                </p>
                <p className="whitespace-pre-wrap rounded-md border border-[#d4e2dc] bg-[#EEF5F1] p-3">
                  {subject.internalNote ?? "—"}
                </p>
              </div>
            </div>
          </Section>
          <Section title="Podmínky poskytování právních služeb">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Smlouva o poskytování právních služeb
                </p>
                {subject.legalServicesContractUrl ? (
                  <a
                    href={subject.legalServicesContractUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-medium text-emerald-950 hover:underline"
                  >
                    {subject.legalServicesContractUrl}
                  </a>
                ) : (
                  <p>—</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Typ odměny
                </p>
                <p>{subject.feeType ? feeTypeLabels[subject.feeType] : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Hodinová sazba
                </p>
                <p>{formatMoney(subject.hourlyRate)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Paušální odměna
                </p>
                <p>{formatMoney(subject.flatFee)}</p>
              </div>
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Poznámka k odměně
                </p>
                <p className="whitespace-pre-wrap rounded-md border border-[#d4e2dc] bg-[#EEF5F1] p-3">
                  {subject.feeNote ?? "—"}
                </p>
              </div>
            </div>
          </Section>
          <Section title="Aktivní projekty">
            {projects.active.length > 0 ? (
              <ProjectList projects={projects.active} />
            ) : (
              <EmptyState>Subjekt nemá aktivní projekty.</EmptyState>
            )}
          </Section>
          <Section title="Neaktivní / archivované projekty">
            {projects.inactive.length > 0 ? (
              <ProjectList projects={projects.inactive} />
            ) : (
              <EmptyState>Subjekt nemá neaktivní ani archivované projekty.</EmptyState>
            )}
          </Section>
          <Section title="Historické vazby subjektu">
            {subject.relations.length > 0 ? (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Typ vazby</th>
                      <th>Projekt</th>
                      <th>Případ</th>
                      <th>Vytvořeno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subject.relations.map((relation) => (
                      <tr key={relation.id}>
                        <td>
                          <Badge tone={subjectRoleTone(relation.role)}>
                            {subjectRoleLabels[relation.role]}
                          </Badge>
                        </td>
                        <td>{relation.relationType}</td>
                        <td>
                          {relation.project ? (
                            <Link
                              href={`/projects/${relation.project.id}`}
                              className="text-emerald-950 hover:underline"
                            >
                              {relation.project.name} (
                              {projectStatusLabels[relation.project.status]})
                            </Link>
                          ) : (
                            "—"
                          )}
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
                        <td>{formatDate(relation.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Subjekt zatím nemá žádné vazby.</EmptyState>
            )}
          </Section>
          <Section title="Conflict check historie">
            {subject.conflictChecks.length > 0 ? (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Dotaz</th>
                      <th>Výsledek</th>
                      <th>Kontroloval</th>
                      <th>Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subject.conflictChecks.map((check) => (
                      <tr key={check.id}>
                        <td>{check.searchedQuery}</td>
                        <td>{check.resultStatus}</td>
                        <td>{check.checkedBy?.name ?? "—"}</td>
                        <td>{formatDate(check.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>Pro subjekt zatím není uložený conflict check.</EmptyState>
            )}
          </Section>
          {canAml && aml ? (
            <SubjectAmlSection
              subjectId={subject.id}
              identifications={aml.identifications}
              assessment={aml.assessment}
            />
          ) : null}
          {portalEnabled ? (
            <SubjectPortalSection
              subjectId={subject.id}
              access={portal?.access ?? null}
              shares={portal?.shares ?? []}
            />
          ) : null}
        </>
      ) : (
        <EmptyState>Detail subjektu není dostupný bez databáze.</EmptyState>
      )}
    </>
  );
}

function ProjectList({ projects }: { projects: SubjectProject[] }) {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Název</th>
            <th>Stav</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id}>
              <td>
                <Link
                  href={`/projects/${project.id}`}
                  className="font-medium text-emerald-950 hover:underline"
                >
                  {project.name}
                </Link>
              </td>
              <td>{projectStatusLabels[project.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
