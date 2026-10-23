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
import { SubjectContactPersons } from "@/components/subject-contact-persons";
import { SubjectContactsList } from "@/components/subject-contacts-list";
import { SubjectStatutoryBodies } from "@/components/subject-statutory-bodies";
import { SubjectDocumentsSection } from "@/components/subject-documents-section";
import { SubjectBillingApprovers } from "@/components/subject-billing-approvers";
import type { ScreeningWithMatches } from "@/components/sanctions-screening-panel";
import { SubjectPortalSection } from "@/components/subject-portal-section";
import { SubjectRegistrySection } from "@/components/subject-registry-section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey, SubjectType } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/entitlements";
import { formatDate, formatDateUtc, formatMoney } from "@/lib/format";
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
  canManageDocuments,
  canManagePortal,
  canViewAllLegalData,
  caseVisibilityWhere,
  documentTemplateVisibilityWhere,
  documentVisibilityWhere,
  projectVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { getOrgUserOptions } from "@/lib/org-users";
import { subjectRoleTone } from "@/lib/status-tones";
import { mergeLegacyEmail } from "@/lib/subjects/contacts";
import { composePersonName } from "@/lib/subjects/person-name";
import { mergeLegacyStatutory } from "@/lib/subjects/statutory";
import { isSafeHttpUrl } from "@/lib/utils";

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
      contactPersons: {
        where: { archivedAt: null },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          project: { select: { name: true } },
          case: { select: { name: true } },
        },
      },
      registryChangeEvents: {
        orderBy: { detectedAt: "desc" },
        take: 10,
        include: { acknowledgedBy: { select: { name: true } } },
      },
      contacts: { orderBy: { position: "asc" } },
      statutoryBodies: { orderBy: { position: "asc" } },
      // Back-links: where this subject acts as a statutory body — only of
      // subjects the user may see.
      statutoryRoles: {
        where: {
          subject: andWhere(
            { archivedAt: null },
            subjectVisibilityWhere(currentUser),
          ),
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          function: true,
          validFrom: true,
          validTo: true,
          subject: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Statutory bodies link to another subject only when the user may see it.
  const linkedIds = Array.from(
    new Set(
      (subject?.statutoryBodies ?? [])
        .map((body) => body.linkedSubjectId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const visibleLinked = linkedIds.length
    ? await prisma.subject.findMany({
        where: andWhere({ id: { in: linkedIds } }, subjectVisibilityWhere(currentUser)),
        select: { id: true, name: true },
      })
    : [];

  // Matters of this client, for the optional project/case binding when adding a
  // contact person (validated again in the action).
  const contactMatters = subject
    ? {
        projects: await prisma.project.findMany({
          where: andWhere(
            { mainSubjectId: subject.id, archivedAt: null },
            projectWhere,
          ),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        cases: await prisma.case.findMany({
          where: andWhere(
            { project: { mainSubjectId: subject.id }, archivedAt: null },
            caseVisibilityWhere(currentUser),
          ),
          orderBy: { name: "asc" },
          select: { id: true, name: true, project: { select: { name: true } } },
        }),
      }
    : { projects: [], cases: [] };

  // AML/KYC data is compliance-sensitive — load it only for ADMIN/PARTNER, and
  // never include it in the main subject query a LAWYER can run.
  const canAml = canViewAllLegalData(currentUser);
  let aml: {
    identifications: Awaited<
      ReturnType<typeof prisma.amlIdentification.findMany>
    >;
    assessment: Awaited<ReturnType<typeof prisma.amlAssessment.findUnique>>;
    screening: ScreeningWithMatches | null;
  } | null = null;
  if (canAml && subject) {
    const [identifications, assessment, screening] = await Promise.all([
      prisma.amlIdentification.findMany({
        where: { subjectId: subject.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.amlAssessment.findUnique({ where: { subjectId: subject.id } }),
      prisma.sanctionsScreening.findFirst({
        where: { subjectId: subject.id },
        orderBy: { createdAt: "desc" },
        include: { matches: { orderBy: { score: "desc" } } },
      }),
    ]);
    aml = { identifications, assessment, screening };
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

  const documentsEnabled =
    subject != null &&
    (await isModuleEnabled(currentUser.organizationId, ModuleKey.DOCUMENTS));
  const [documents, documentTemplates] = documentsEnabled
    ? await Promise.all([
        prisma.document.findMany({
          where: andWhere(
            { subjectId: id, archivedAt: null },
            documentVisibilityWhere(currentUser),
          ),
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            kind: true,
            name: true,
            storageUrl: true,
            currentVersion: { select: { version: true } },
          },
          take: 200,
        }),
        prisma.documentTemplate.findMany({
          where: andWhere(
            { archivedAt: null, active: true },
            documentTemplateVisibilityWhere(currentUser),
          ),
          orderBy: { name: "asc" },
          select: { id: true, name: true },
          take: 200,
        }),
      ])
    : [[], []];

  const [billingApprovers, billingApproverMembers] = canAml && subject
    ? await Promise.all([
        prisma.subjectBillingApprover.findMany({
          where: { subjectId: subject.id },
          orderBy: { user: { name: "asc" } },
          select: {
            id: true,
            user: { select: { id: true, name: true } },
          },
        }),
        getOrgUserOptions(currentUser),
      ])
    : [[], []];

  return {
    subject,
    visibleLinked,
    canArchive: canViewAllLegalData(currentUser),
    canEdit: subject ? canEditRecord(currentUser, "Subject", subject) : false,
    canAml,
    aml,
    portalEnabled,
    portal,
    contactMatters,
    documentsEnabled,
    documents,
    documentTemplates,
    canManageDocuments: canManageDocuments(currentUser),
    billingApprovers,
    billingApproverMembers,
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
    obchodniRejstrik: `https://or.justice.cz/ias/ui/rejstrik-$firma?ico=${encodeURIComponent(ico)}&jenPlatne=PLATNE`,
    isir: `https://isir.justice.cz/isir/ueu/vysledek_lustrace.do?ic=${encodeURIComponent(ico)}&aktualnost=AKTUALNI_I_UKONCENA&rowsAtOnce=50`,
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
      visibleLinked: [],
      canArchive: false,
      canEdit: false,
      canAml: false,
      aml: null,
      portalEnabled: false,
      portal: null,
      contactMatters: { projects: [], cases: [] },
      documentsEnabled: false,
      documents: [],
      documentTemplates: [],
      canManageDocuments: false,
      billingApprovers: [],
      billingApproverMembers: [],
    },
    () => loadSubject(id),
  );

  if (result.databaseReady && !result.data.subject) {
    notFound();
  }

  const {
    subject,
    visibleLinked,
    canArchive,
    canEdit,
    canAml,
    aml,
    portalEnabled,
    portal,
    contactMatters,
    documentsEnabled,
    documents,
    documentTemplates,
    canManageDocuments: canManageDocumentsFlag,
    billingApprovers,
    billingApproverMembers,
  } = result.data;
  const projects = subject ? projectGroups(subject) : { active: [], inactive: [] };
  const links = subject?.ico ? icoLinks(subject.ico) : null;
  // Only render the stored contract URL as a live link when it's an http(s)
  // URL, so a manually-entered javascript:/data: value can't execute on click.
  const contractUrl = isSafeHttpUrl(subject?.legalServicesContractUrl)
    ? subject.legalServicesContractUrl
    : null;
  const isPerson = subject?.type === SubjectType.PERSON;
  const isEntrepreneur = subject?.type === SubjectType.ENTREPRENEUR;
  const contactItems = subject
    ? mergeLegacyEmail(subject.contacts, subject.email).map((contact) => ({
        id: contact.id ?? null,
        type: contact.type,
        value: contact.value,
        label: contact.label ?? null,
        isPrimary: contact.isPrimary,
      }))
    : [];
  const linkedById = new Map(visibleLinked.map((item) => [item.id, item]));
  const statutoryItems = subject
    ? mergeLegacyStatutory(subject.statutoryBodies, subject.statutoryBody).map(
        (body) => {
          const linkedId = "linkedSubjectId" in body ? body.linkedSubjectId : null;
          return {
            id: "id" in body ? (body.id ?? null) : null,
            name: body.name,
            function: body.function ?? null,
            actingMethod: "actingMethod" in body ? (body.actingMethod ?? null) : null,
            validFrom: body.validFrom ? new Date(body.validFrom) : null,
            validTo: body.validTo ? new Date(body.validTo) : null,
            linkedSubject: linkedId ? (linkedById.get(linkedId) ?? null) : null,
          };
        },
      )
    : [];
  const personName = subject ? composePersonName(subject) : "";

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
          <Section title="Základní údaje">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">Typ</p>
                <p>{subjectTypeLabels[subject.type]}</p>
              </div>
              {isPerson || isEntrepreneur ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-stone-500">
                    Jméno a příjmení
                  </p>
                  <p>{personName || subject.name}</p>
                </div>
              ) : null}
              {isEntrepreneur ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-stone-500">
                    Obchodní firma
                  </p>
                  <p>{subject.tradeName ?? "—"}</p>
                </div>
              ) : null}
              {isPerson || (isEntrepreneur && subject.birthDate) ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-stone-500">
                    Datum narození
                  </p>
                  <p>{subject.birthDate ? formatDateUtc(subject.birthDate) : "—"}</p>
                </div>
              ) : null}
              {isPerson ? (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase text-stone-500">
                      Rodné číslo
                    </p>
                    <p className="font-mono">{subject.birthNumber ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-stone-500">
                      Státní příslušnost
                    </p>
                    <p>{subject.nationality ?? "—"}</p>
                  </div>
                </>
              ) : null}
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  {isPerson
                    ? "Trvalé bydliště"
                    : isEntrepreneur
                      ? "Místo podnikání"
                      : "Sídlo"}
                </p>
                <p>{subject.address ?? "—"}</p>
              </div>
              {subject.deliveryAddress || isPerson ? (
                <div className="md:col-span-3">
                  <p className="text-xs font-semibold uppercase text-stone-500">
                    Doručovací adresa
                  </p>
                  <p>{subject.deliveryAddress ?? "—"}</p>
                </div>
              ) : null}
              {isPerson && (subject.ico || subject.dic) ? (
                <p className="text-sm text-amber-900 md:col-span-3">
                  U fyzické osoby jsou evidované starší údaje IČO/DIČ – pokud
                  osoba podniká, změňte typ na Fyzická osoba podnikatel.
                </p>
              ) : null}
              {!isPerson || subject.ico || subject.dic ? (
              <>
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
              </>
              ) : null}
              {!isPerson ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-stone-500">
                    Právní forma
                  </p>
                  <p>{subject.legalForm ?? "—"}</p>
                </div>
              ) : null}
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
                <p className="whitespace-pre-wrap rounded-md border border-[#dce4e8] bg-[#F4F7F8] p-3">
                  {subject.internalNote ?? "—"}
                </p>
              </div>
            </div>
          </Section>
          <SubjectContactsList
            subjectId={subject.id}
            contacts={contactItems}
            canEdit={canEdit}
          />
          <SubjectStatutoryBodies
            subjectId={subject.id}
            bodies={statutoryItems}
            roles={subject.statutoryRoles}
            canEdit={canEdit}
            showEmpty={!isPerson && !isEntrepreneur}
          />
          {isPerson && !subject.ico ? null : (
            <SubjectRegistrySection
              subjectId={subject.id}
              watchEnabled={subject.registryWatchEnabled}
              checkedAt={subject.registryCheckedAt}
              hasIco={Boolean(subject.ico)}
              events={subject.registryChangeEvents}
              canEdit={canEdit}
            />
          )}
          <SubjectContactPersons
            subjectId={subject.id}
            contacts={subject.contactPersons}
            projects={contactMatters.projects}
            cases={contactMatters.cases}
            canEdit={canEdit}
          />
          <Section title="Podmínky poskytování právních služeb">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase text-stone-500">
                  Smlouva o poskytování právních služeb
                </p>
                {contractUrl ? (
                  <a
                    href={contractUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-medium text-emerald-950 hover:underline"
                  >
                    {contractUrl}
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
                <p className="whitespace-pre-wrap rounded-md border border-[#dce4e8] bg-[#F4F7F8] p-3">
                  {subject.feeNote ?? "—"}
                </p>
              </div>
            </div>
          </Section>
          {canAml ? (
            <SubjectBillingApprovers
              subjectId={subject.id}
              members={billingApproverMembers}
              approvers={billingApprovers}
            />
          ) : null}
          {documentsEnabled ? (
            <SubjectDocumentsSection
              subjectId={subject.id}
              documents={documents}
              templates={documentTemplates}
              canManage={canManageDocumentsFlag}
            />
          ) : null}
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
              <div className="table-scroll">
                <table className="w-max min-w-full table-auto">
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
              <div className="table-scroll">
                <table className="w-max min-w-full table-auto">
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
              screening={aml.screening}
            />
          ) : null}
          {portalEnabled ? (
            <SubjectPortalSection
              subjectId={subject.id}
              access={portal?.access ?? null}
              shares={portal?.shares ?? []}
              defaultEmail={subject.email}
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
    <div className="table-scroll">
      <table className="w-max min-w-full table-auto">
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
