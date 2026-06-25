import Link from "next/link";

import { logoutPortal } from "@/app/(portal)/actions";
import { Button } from "@/components/ui/button";
import { caseStatusLabels, documentKindLabels } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import {
  listSharedCases,
  listSharedDocuments,
} from "@/lib/portal/portal-data";
import { requirePortalClient } from "@/lib/portal/portal-auth";
import type { DocumentKind, CaseStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export const metadata = { title: "Klientský portál" };

export default async function PortalDashboardPage() {
  const client = await requirePortalClient();
  const [documents, cases] = await Promise.all([
    listSharedDocuments(client),
    listSharedCases(client),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">
            Klientský portál
          </h1>
          <p className="text-sm text-stone-500">{client.email}</p>
        </div>
        <form action={logoutPortal}>
          <Button type="submit" variant="secondary">
            Odhlásit se
          </Button>
        </form>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium text-stone-900">
          Sdílené dokumenty
        </h2>
        {documents.length > 0 ? (
          <ul className="grid gap-2">
            {documents.map((document) => (
              <li
                key={document.id}
                className="rounded-md border border-stone-200 bg-white px-4 py-3"
              >
                <Link
                  href={`/portal/documents/${document.id}`}
                  className="font-medium text-[#072924] underline-offset-2 hover:underline"
                >
                  {document.name}
                </Link>
                <p className="text-xs text-stone-500">
                  {documentKindLabels[document.kind as DocumentKind]} · verze{" "}
                  {document.version} · aktualizováno {formatDate(document.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">
            Zatím s vámi nebyly sdíleny žádné dokumenty.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-stone-900">Sdílené spisy</h2>
        {cases.length > 0 ? (
          <ul className="grid gap-2">
            {cases.map((legalCase) => (
              <li
                key={legalCase.id}
                className="rounded-md border border-stone-200 bg-white px-4 py-3"
              >
                <Link
                  href={`/portal/cases/${legalCase.id}`}
                  className="font-medium text-[#072924] underline-offset-2 hover:underline"
                >
                  {legalCase.name}
                </Link>
                <p className="text-xs text-stone-500">
                  {legalCase.fileNumber ? `${legalCase.fileNumber} · ` : ""}
                  {caseStatusLabels[legalCase.status as CaseStatus]}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">
            Zatím s vámi nebyly sdíleny žádné spisy.
          </p>
        )}
      </section>
    </main>
  );
}
