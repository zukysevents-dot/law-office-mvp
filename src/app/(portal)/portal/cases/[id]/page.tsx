import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import type { CaseStatus } from "@/generated/prisma/enums";
import { auditJson, writeAuditLog } from "@/lib/audit";
import { formatDate } from "@/lib/format";
import { caseStatusLabels } from "@/lib/labels";
import { requirePortalClient } from "@/lib/portal/portal-auth";
import { getSharedCase } from "@/lib/portal/portal-data";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sdílený spis" };

export default async function PortalCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await requirePortalClient();
  const legalCase = await getSharedCase(client, id);

  if (!legalCase) {
    notFound();
  }

  await writeAuditLog({
    entityType: "Case",
    entityId: legalCase.id,
    action: "PORTAL_VIEW_CASE",
    changedById: null,
    newValue: auditJson({ portalAccessId: client.portalAccessId }),
  });

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">{legalCase.name}</h1>
        <ButtonLink href="/portal" variant="secondary">
          Zpět
        </ButtonLink>
      </div>

      <dl className="grid gap-4 rounded-md border border-stone-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-stone-500">Spisová značka</dt>
          <dd className="mt-1 text-sm text-stone-800">
            {legalCase.fileNumber ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-stone-500">Stav</dt>
          <dd className="mt-1 text-sm text-stone-800">
            {caseStatusLabels[legalCase.status as CaseStatus]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-stone-500">Aktualizováno</dt>
          <dd className="mt-1 text-sm text-stone-800">
            {formatDate(legalCase.updatedAt)}
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-sm">
        <Link href="/portal" className="text-[#072924] hover:underline">
          ← Zpět na přehled
        </Link>
      </p>
    </main>
  );
}
