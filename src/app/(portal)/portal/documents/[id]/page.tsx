import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import type { DocumentKind } from "@/generated/prisma/enums";
import { auditJson, writeAuditLog } from "@/lib/audit";
import { formatDate } from "@/lib/format";
import { documentKindLabels } from "@/lib/labels";
import { requirePortalClient } from "@/lib/portal/portal-auth";
import { getSharedDocument } from "@/lib/portal/portal-data";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sdílený dokument" };

export default async function PortalDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await requirePortalClient();
  const document = await getSharedDocument(client, id);

  // Not shared (or revoked/archived) → 404. Access goes through the whitelist, so
  // a client can never reach a document that wasn't explicitly shared.
  if (!document) {
    notFound();
  }

  await writeAuditLog({
    entityType: "Document",
    entityId: document.id,
    action: "PORTAL_VIEW_DOCUMENT",
    changedById: null,
    newValue: auditJson({ portalAccessId: client.portalAccessId }),
  });

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">{document.name}</h1>
        <ButtonLink href="/portal" variant="secondary">
          Zpět
        </ButtonLink>
      </div>

      <dl className="grid gap-4 rounded-md border border-stone-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-stone-500">Typ</dt>
          <dd className="mt-1 text-sm text-stone-800">
            {documentKindLabels[document.kind as DocumentKind]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-stone-500">Verze</dt>
          <dd className="mt-1 text-sm text-stone-800">{document.version}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-stone-500">Aktualizováno</dt>
          <dd className="mt-1 text-sm text-stone-800">
            {formatDate(document.updatedAt)}
          </dd>
        </div>
        {document.description ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-stone-500">Popis</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-stone-800">
              {document.description}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-4 text-xs text-stone-400">
        Pro získání souboru kontaktujte prosím svou advokátní kancelář.
      </p>
      <p className="mt-6 text-sm">
        <Link href="/portal" className="text-[#072924] hover:underline">
          ← Zpět na přehled
        </Link>
      </p>
    </main>
  );
}
