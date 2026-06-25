import { notFound } from "next/navigation";

import { assignToCase, downloadAttachment } from "@/app/actions/data-boxes";
import { Field, SelectInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { ModuleKey } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { assertModuleEnabled } from "@/lib/entitlements";
import { formatCaseLabel, formatDate } from "@/lib/format";
import {
  dataMessageDirectionLabels,
  dataMessageStatusLabels,
} from "@/lib/labels";
import {
  andWhere,
  caseVisibilityWhere,
  dataMessageVisibilityWhere,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { dataMessageStatusTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

const detailInclude = {
  account: { select: { label: true } },
  case: { select: { id: true, name: true, fileNumber: true } },
  subject: { select: { id: true, name: true } },
  attachments: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.DataMessageInclude;

type Detail = Prisma.DataMessageGetPayload<{ include: typeof detailInclude }>;

type Data = {
  message: Detail;
  cases: Array<{ id: string; name: string; fileNumber: string | null }>;
  subjects: Array<{ id: string; name: string }>;
};

export default async function DataMessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await safeQuery<Data | null>(null, async () => {
    const currentUser = await getCurrentUser();
    await assertModuleEnabled(currentUser, ModuleKey.DATA_BOXES);
    const prisma = getPrisma();
    const message = await prisma.dataMessage.findFirst({
      where: andWhere(dataMessageVisibilityWhere(currentUser), { id }),
      include: detailInclude,
    });
    if (!message) {
      return null;
    }
    const [cases, subjects] = await Promise.all([
      prisma.case.findMany({
        where: andWhere(caseVisibilityWhere(currentUser), { archivedAt: null }),
        select: { id: true, name: true, fileNumber: true },
        orderBy: { name: "asc" },
        take: 500,
      }),
      prisma.subject.findMany({
        where: andWhere(subjectVisibilityWhere(currentUser), {
          archivedAt: null,
        }),
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 500,
      }),
    ]);
    return { message, cases, subjects };
  });

  if (result.databaseReady && !result.data) {
    notFound();
  }

  const data = result.data;
  const message = data?.message;

  return (
    <>
      <PageHeader
        title={message?.messageSubject ?? "Datová zpráva"}
        description={
          message ? dataMessageDirectionLabels[message.direction] : "Detail"
        }
        action={
          <ButtonLink href="/data-boxes" variant="secondary">
            Zpět na schránky
          </ButtonLink>
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      {data && message ? (
        <>
          <Section title="Údaje zprávy">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-stone-500">Stav</dt>
                <dd className="mt-1">
                  <Badge tone={dataMessageStatusTone(message.status)}>
                    {dataMessageStatusLabels[message.status]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">Doručeno</dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {formatDate(message.deliveredAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">
                  ID datové zprávy
                </dt>
                <dd className="mt-1 font-mono text-xs text-stone-700">
                  {message.dmId ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">Odesílatel</dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {message.senderBoxId ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">Příjemce</dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {message.recipientBoxId ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-stone-500">Schránka</dt>
                <dd className="mt-1 text-sm text-stone-700">
                  {message.account?.label ?? "—"}
                </dd>
              </div>
            </dl>
            {message.note ? (
              <p className="mt-4 text-sm text-stone-600">{message.note}</p>
            ) : null}
          </Section>

          <Section title="Přílohy">
            {message.attachments.length > 0 ? (
              <ul className="grid gap-2">
                {message.attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-[#d4e2dc] px-3 py-2"
                  >
                    <span className="text-sm text-stone-800">
                      {attachment.fileName}
                    </span>
                    {attachment.storageUrl ? (
                      <form action={downloadAttachment}>
                        <input
                          type="hidden"
                          name="attachmentId"
                          value={attachment.id}
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          className="h-9 px-3"
                        >
                          Otevřít
                        </Button>
                      </form>
                    ) : (
                      <span className="text-xs text-stone-400">bez souboru</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>Zpráva nemá žádné přílohy.</EmptyState>
            )}
          </Section>

          <Section title="Přiřazení ke spisu / klientovi">
            <form action={assignToCase} className="grid gap-4 sm:max-w-xl">
              <input type="hidden" name="messageId" value={message.id} />
              <Field label="Spis">
                <SelectInput name="caseId" defaultValue={message.caseId ?? ""}>
                  <option value="">— nepřiřazeno —</option>
                  {data.cases.map((legalCase) => (
                    <option key={legalCase.id} value={legalCase.id}>
                      {formatCaseLabel(legalCase)}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Klient (subjekt)">
                <SelectInput
                  name="subjectId"
                  defaultValue={message.subjectId ?? ""}
                >
                  <option value="">— nepřiřazeno —</option>
                  {data.subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <div>
                <Button type="submit">Uložit přiřazení</Button>
              </div>
            </form>
          </Section>
        </>
      ) : null}
    </>
  );
}
