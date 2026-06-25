import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addDocumentVersion,
  archiveDocument,
  restoreDocument,
  updateDocument,
} from "@/app/actions/documents";
import { shareDocument } from "@/app/actions/portal";
import { ArchiveActionForm } from "@/components/archive-action-form";
import { ArchiveNotice } from "@/components/archive-notice";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { DocumentKind, ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled, isModuleEnabled } from "@/lib/entitlements";
import { formatDateTime } from "@/lib/format";
import { documentKindLabels } from "@/lib/labels";
import {
  andWhere,
  canManageDocuments,
  canManagePortal,
  canViewAllLegalData,
  documentVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { documentKindTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

const detailInclude = {
  case: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  versions: {
    orderBy: { version: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  },
} satisfies Prisma.DocumentInclude;

type Detail = Prisma.DocumentGetPayload<{ include: typeof detailInclude }>;

type PortalTarget = { id: string; subject: { name: string } };

type Data = {
  document: Detail | null;
  canManage: boolean;
  canArchive: boolean;
  portalTargets: PortalTarget[];
};

const emptyData: Data = {
  document: null,
  canManage: false,
  canArchive: false,
  portalTargets: [],
};

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);

    const prisma = getPrisma();
    const document = await prisma.document.findFirst({
      where: andWhere({ id }, documentVisibilityWhere(currentUser)),
      include: detailInclude,
    });

    const canShare =
      document != null &&
      canManagePortal(currentUser) &&
      (await isModuleEnabled(
        currentUser.organizationId,
        ModuleKey.CLIENT_PORTAL,
      ));
    const portalTargets = canShare
      ? await prisma.portalAccess.findMany({
          where: {
            organizationId: currentUser.organizationId ?? undefined,
            status: "ACTIVE",
          },
          orderBy: { subject: { name: "asc" } },
          select: { id: true, subject: { select: { name: true } } },
        })
      : [];

    return {
      document,
      canManage: canManageDocuments(currentUser),
      canArchive: canViewAllLegalData(currentUser),
      portalTargets,
    };
  });

  if (result.databaseReady && !result.data.document) {
    notFound();
  }

  const { document, canManage, canArchive, portalTargets } = result.data;

  return (
    <>
      <PageHeader
        title={document?.name ?? "Dokument"}
        description="Detail dokumentu, historie verzí a metadata."
        action={
          <ButtonLink href="/documents" variant="secondary">
            Zpět na dokumenty
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />
      <ArchiveNotice archivedAt={document?.archivedAt ?? null} />

      {document ? (
        <>
          <Section title="Údaje dokumentu">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-stone-500">Typ</dt>
                <dd className="mt-1">
                  <Badge tone={documentKindTone(document.kind)}>
                    {documentKindLabels[document.kind]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">
                  Spis / subjekt
                </dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {document.case ? (
                    <Link
                      href={`/cases/${document.case.id}`}
                      className="text-[#072924] underline-offset-2 hover:underline"
                    >
                      {document.case.name}
                    </Link>
                  ) : document.subject ? (
                    <Link
                      href={`/subjects/${document.subject.id}`}
                      className="text-[#072924] underline-offset-2 hover:underline"
                    >
                      {document.subject.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">
                  Aktuální odkaz
                </dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {document.storageUrl ? (
                    <a
                      href={document.storageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#072924] underline-offset-2 hover:underline"
                    >
                      Otevřít v SharePointu
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            {document.description ? (
              <p className="mt-4 whitespace-pre-wrap text-sm text-stone-600">
                {document.description}
              </p>
            ) : null}
          </Section>

          <Section title="Historie verzí">
            <div className="table-scroll">
              <table className="w-max min-w-full">
                <thead>
                  <tr>
                    <th>Verze</th>
                    <th>Odkaz</th>
                    <th>Poznámka</th>
                    <th>Nahrál</th>
                    <th>Kdy</th>
                  </tr>
                </thead>
                <tbody>
                  {document.versions.map((version) => (
                    <tr key={version.id}>
                      <td className="font-medium text-stone-950">
                        v{version.version}
                      </td>
                      <td>
                        <a
                          href={version.storageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#072924] underline-offset-2 hover:underline"
                        >
                          Otevřít
                        </a>
                      </td>
                      <td>{version.note ?? "—"}</td>
                      <td>{version.uploadedBy?.name ?? "—"}</td>
                      <td>{formatDateTime(version.uploadedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {canManage && !document.archivedAt ? (
            <>
              <Section title="Přidat verzi">
                <form
                  action={addDocumentVersion}
                  className="grid gap-4 sm:max-w-2xl"
                >
                  <input type="hidden" name="documentId" value={document.id} />
                  <Field label="Odkaz do SharePointu (http/https)">
                    <TextInput name="storageUrl" type="url" required />
                  </Field>
                  <Field label="Poznámka k verzi (volitelné)">
                    <TextInput name="note" />
                  </Field>
                  <div>
                    <Button type="submit">Přidat verzi</Button>
                  </div>
                </form>
              </Section>

              <Section title="Úprava metadat">
                <form action={updateDocument} className="grid gap-4 sm:max-w-2xl">
                  <input type="hidden" name="documentId" value={document.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Název">
                      <TextInput name="name" defaultValue={document.name} required />
                    </Field>
                    <Field label="Typ">
                      <SelectInput name="kind" defaultValue={document.kind}>
                        {Object.values(DocumentKind).map((kind) => (
                          <option key={kind} value={kind}>
                            {documentKindLabels[kind]}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                  </div>
                  <Field label="Popis (volitelné)">
                    <TextArea
                      name="description"
                      defaultValue={document.description ?? ""}
                    />
                  </Field>
                  <div>
                    <Button type="submit">Uložit metadata</Button>
                  </div>
                </form>
              </Section>
            </>
          ) : null}

          {portalTargets.length > 0 && !document.archivedAt ? (
            <Section title="Sdílet s klientem">
              <form action={shareDocument} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="documentId" value={document.id} />
                <Field label="Klient (portálový přístup)">
                  <SelectInput name="portalAccessId" defaultValue={portalTargets[0].id}>
                    {portalTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.subject.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Button type="submit" variant="secondary">
                  Sdílet dokument
                </Button>
              </form>
              <p className="mt-2 text-xs text-stone-400">
                Klient uvidí jen metadata dokumentu (název, typ, verze), ne odkaz
                do SharePointu.
              </p>
            </Section>
          ) : null}

          {canArchive ? (
            <Section title={document.archivedAt ? "Obnovit" : "Archivovat"}>
              <ArchiveActionForm
                action={document.archivedAt ? restoreDocument : archiveDocument}
                id={document.id}
                idFieldName="documentId"
                mode={document.archivedAt ? "restore" : "archive"}
              />
            </Section>
          ) : null}
        </>
      ) : (
        <EmptyState>Detail dokumentu není dostupný bez databáze.</EmptyState>
      )}
    </>
  );
}
