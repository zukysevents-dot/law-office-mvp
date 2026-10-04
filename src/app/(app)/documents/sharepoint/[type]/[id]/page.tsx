import { ChevronRight, File, Folder, FolderPlus, Upload } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createSharepointSubfolder,
  deleteSharepointItem,
  uploadToSharepointFolder,
} from "@/app/actions/sharepoint-browser";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Field, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatBytes, formatDateTime } from "@/lib/format";
import {
  isSharepointUploadConfigured,
  listSharepointChildren,
  type SharepointItem,
} from "@/lib/microsoft/graph-drive";
import {
  matterBrowsePath,
  parseEntityType,
  resolveMatterFolder,
  type MatterFolder,
} from "@/lib/microsoft/matter-folder";
import { formatRelativePath, parseRelativePath } from "@/lib/microsoft/sharepoint";
import { canEditRecord, canManageDocuments } from "@/lib/permissions";
import { isSafeHttpUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Data = {
  matter: MatterFolder | null;
  items: SharepointItem[];
  truncated: boolean;
  /** null = kancelář nemá SharePoint připojený. */
  configured: boolean;
  canWrite: boolean;
  canDelete: boolean;
  error: string | null;
};

const EMPTY: Data = {
  matter: null,
  items: [],
  truncated: false,
  configured: false,
  canWrite: false,
  canDelete: false,
  error: null,
};

type PageProps = {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ path?: string }>;
};

export default async function SharepointBrowserPage({
  params,
  searchParams,
}: PageProps) {
  const { type: rawType, id } = await params;
  const { path: rawPath } = await searchParams;

  const type = parseEntityType(rawType);
  if (!type) {
    notFound();
  }
  // Cesta z URL projde filtrem dřív, než se z ní cokoli poskládá.
  const relativeSegments = parseRelativePath(rawPath);
  const relativePath = formatRelativePath(relativeSegments);

  const result = await safeQuery<Data>(EMPTY, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DOCUMENTS);

    const matter = await resolveMatterFolder(type, id);
    if (!matter) {
      return EMPTY;
    }
    const canWrite = canEditRecord(currentUser, type, matter.editRecord);

    // Stav připojení se zjišťuje ZVLÁŠŤ, ne z výsledku výpisu — jinak by selhání
    // Graphu (vypršelý secret, chybějící oprávnění) vypadalo jako „nepřipojeno"
    // a poslalo admina nastavovat něco, co je nastavené.
    const configured = await isSharepointUploadConfigured(
      currentUser.organizationId,
    );
    if (!configured) {
      return {
        matter,
        items: [],
        truncated: false,
        configured: false,
        canWrite,
        canDelete: canWrite && canManageDocuments(currentUser),
        error: null,
      };
    }

    let listing = null;
    let error: string | null = null;
    try {
      listing = await listSharepointChildren(currentUser.organizationId, [
        ...matter.rootSegments,
        ...relativeSegments,
      ]);
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Obsah složky se nepodařilo načíst.";
    }

    return {
      matter,
      items: listing?.items ?? [],
      truncated: listing?.truncated ?? false,
      configured: true,
      canWrite,
      canDelete: canWrite && canManageDocuments(currentUser),
      error,
    };
  });

  const data = result.data ?? EMPTY;
  if (result.databaseReady && !data.matter) {
    notFound();
  }
  const matter = data.matter;

  return (
    <>
      <PageHeader
        title={matter ? `Soubory — ${matter.title}` : "Soubory"}
        description="Obsah složky spisu v SharePointu. Kliknutím na soubor se otevře přímo v SharePointu."
        action={
          matter ? (
            <ButtonLink href={matter.detailPath} variant="secondary">
              Zpět na detail
            </ButtonLink>
          ) : null
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {matter ? (
        <>
          <nav
            aria-label="Cesta ve složce"
            className="flex flex-wrap items-center gap-1 text-sm text-stone-600"
          >
            <Link
              href={matterBrowsePath(matter.type, matter.id)}
              className="font-medium text-emerald-950 hover:underline"
            >
              {matter.title}
            </Link>
            {relativeSegments.map((segment, index) => (
              <span key={`${segment}-${index}`} className="flex items-center gap-1">
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                {index === relativeSegments.length - 1 ? (
                  <span className="font-medium text-stone-950">{segment}</span>
                ) : (
                  <Link
                    href={matterBrowsePath(
                      matter.type,
                      matter.id,
                      formatRelativePath(relativeSegments.slice(0, index + 1)),
                    )}
                    className="text-emerald-950 hover:underline"
                  >
                    {segment}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          {!data.configured ? (
            <Section title="SharePoint není připojený">
              <p className="text-sm text-stone-600">
                Aby šlo procházet soubory, musí mít kancelář nastavený web
                SharePointu a přihlašovací údaje Microsoft Graph.
              </p>
              <ButtonLink
                href="/settings/sharepoint"
                variant="secondary"
                className="mt-3"
              >
                Nastavit připojení
              </ButtonLink>
            </Section>
          ) : (
            <>
              {data.error ? (
                <Section className="border-amber-300 bg-amber-50">
                  <p className="text-sm text-amber-900">{data.error}</p>
                </Section>
              ) : null}

              <Section title="Obsah složky">
                {data.items.length > 0 ? (
                  <div className="table-scroll">
                    <table className="w-max min-w-full">
                      <thead>
                        <tr>
                          <th>Název</th>
                          <th>Velikost</th>
                          <th>Změněno</th>
                          {data.canDelete ? <th>Akce</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((item) => {
                          const safeUrl = isSafeHttpUrl(item.webUrl)
                            ? item.webUrl
                            : null;
                          return (
                            <tr key={item.name}>
                              <td className="font-medium text-stone-950">
                                <span className="inline-flex items-center gap-2">
                                  {item.isFolder ? (
                                    <Folder
                                      className="h-4 w-4 shrink-0 text-stone-500"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <File
                                      className="h-4 w-4 shrink-0 text-stone-500"
                                      aria-hidden="true"
                                    />
                                  )}
                                  {item.isFolder ? (
                                    <Link
                                      href={matterBrowsePath(
                                        matter.type,
                                        matter.id,
                                        formatRelativePath([
                                          ...relativeSegments,
                                          item.name,
                                        ]),
                                      )}
                                      className="hover:underline"
                                    >
                                      {item.name}
                                    </Link>
                                  ) : safeUrl ? (
                                    <a
                                      href={safeUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="hover:underline"
                                    >
                                      {item.name}
                                    </a>
                                  ) : (
                                    <span>{item.name}</span>
                                  )}
                                </span>
                              </td>
                              <td>
                                {item.isFolder
                                  ? `${item.childCount ?? 0} položek`
                                  : formatBytes(item.size)}
                              </td>
                              <td>{formatDateTime(item.lastModified)}</td>
                              {data.canDelete ? (
                                <td>
                                  <form action={deleteSharepointItem}>
                                    <input
                                      type="hidden"
                                      name="entityType"
                                      value={matter.type}
                                    />
                                    <input type="hidden" name="id" value={matter.id} />
                                    <input
                                      type="hidden"
                                      name="path"
                                      value={relativePath}
                                    />
                                    <input
                                      type="hidden"
                                      name="name"
                                      value={item.name}
                                    />
                                    <ConfirmSubmitButton
                                      message={`Opravdu smazat „${item.name}" ze SharePointu? Akci nelze vrátit.`}
                                    >
                                      Smazat
                                    </ConfirmSubmitButton>
                                  </form>
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState>
                    Složka je prázdná nebo v SharePointu zatím neexistuje.
                  </EmptyState>
                )}

                {data.truncated ? (
                  <p className="mt-3 text-sm text-amber-900">
                    Složka obsahuje víc položek, než se sem vejde. Zbytek si
                    otevřete přímo v SharePointu.
                  </p>
                ) : null}
              </Section>

              {data.canWrite ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Section title="Nahrát soubor">
                    <form action={uploadToSharepointFolder} className="grid gap-3">
                      <input type="hidden" name="entityType" value={matter.type} />
                      <input type="hidden" name="id" value={matter.id} />
                      <input type="hidden" name="path" value={relativePath} />
                      <Field label="Soubor (max. 4 MB)">
                        <TextInput name="file" type="file" required />
                      </Field>
                      <div>
                        <Button type="submit">
                          <Upload className="h-4 w-4" aria-hidden="true" />
                          Nahrát do této složky
                        </Button>
                      </div>
                    </form>
                  </Section>

                  <Section title="Nová podsložka">
                    <form action={createSharepointSubfolder} className="grid gap-3">
                      <input type="hidden" name="entityType" value={matter.type} />
                      <input type="hidden" name="id" value={matter.id} />
                      <input type="hidden" name="path" value={relativePath} />
                      <Field label="Název složky">
                        <TextInput name="name" required maxLength={120} />
                      </Field>
                      <div>
                        <Button type="submit" variant="secondary">
                          <FolderPlus className="h-4 w-4" aria-hidden="true" />
                          Založit složku
                        </Button>
                      </div>
                    </form>
                  </Section>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </>
  );
}
