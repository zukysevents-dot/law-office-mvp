import { addManualMessage } from "@/app/actions/data-boxes";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import type { Prisma } from "@/generated/prisma/client";
import { DataMessageDirection, ModuleKey } from "@/generated/prisma/enums";
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
  canViewAllLegalData,
  dataMessageVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { dataMessageStatusTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

const messageInclude = {
  case: { select: { name: true, fileNumber: true } },
  subject: { select: { name: true } },
} satisfies Prisma.DataMessageInclude;

type MessageRow = Prisma.DataMessageGetPayload<{ include: typeof messageInclude }>;

type Data = {
  messages: MessageRow[];
  canConfigure: boolean;
};

export default async function DataBoxesPage() {
  const result = await safeQuery<Data>(
    { messages: [], canConfigure: false },
    async () => {
      const currentUser = await getCurrentUser();
      await assertModuleEnabled(currentUser, ModuleKey.DATA_BOXES);
      const messages = await getPrisma().dataMessage.findMany({
        where: andWhere(dataMessageVisibilityWhere(currentUser), {
          archivedAt: null,
        }),
        include: messageInclude,
        orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }],
        take: 500,
      });
      return { messages, canConfigure: canViewAllLegalData(currentUser) };
    },
  );

  const data = result.data ?? { messages: [], canConfigure: false };

  return (
    <>
      <PageHeader
        title="Datové schránky"
        description="Evidence doručených a odeslaných datových zpráv a jejich přiřazení ke spisu."
        action={
          data.canConfigure ? (
            <ButtonLink href="/settings/data-boxes" variant="secondary">
              Nastavení přístupu
            </ButtonLink>
          ) : undefined
        }
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Zatím jen evidence zpráv.</strong> Živá integrace datových schránek
        (automatické odesílání/příjem) čeká na rozhodnutí{" "}
        <strong>oficiální ISDS API vs partner (např. EXevido)</strong> — k vyřešení
        s právníky. Do té doby zprávy evidujte ručně.
      </div>

      <Section title="Zprávy">
        {data.messages.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Směr</th>
                  <th>Předmět</th>
                  <th>Doručeno</th>
                  <th>Stav</th>
                  <th>Spis / klient</th>
                </tr>
              </thead>
              <tbody>
                {data.messages.map((message) => (
                  <tr key={message.id}>
                    <td>{dataMessageDirectionLabels[message.direction]}</td>
                    <td className="font-medium text-stone-950">
                      <a
                        href={`/data-boxes/${message.id}`}
                        className="text-[#072924] underline-offset-2 hover:underline"
                      >
                        {message.messageSubject}
                      </a>
                    </td>
                    <td>{formatDate(message.deliveredAt)}</td>
                    <td>
                      <Badge tone={dataMessageStatusTone(message.status)}>
                        {dataMessageStatusLabels[message.status]}
                      </Badge>
                    </td>
                    <td>
                      {message.case
                        ? formatCaseLabel(message.case)
                        : (message.subject?.name ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Zatím není evidovaná žádná datová zpráva.</EmptyState>
        )}
      </Section>

      <Section title="Zaevidovat zprávu ručně">
        <p className="mb-4 text-sm text-stone-600">
          Dokud není napojeno automatické stahování z ISDS, zprávy se evidují
          ručně. ID datové zprávy (volitelné) zabrání duplicitě.
        </p>
        <form action={addManualMessage} className="grid gap-4 sm:max-w-2xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Směr">
              <SelectInput name="direction" defaultValue={DataMessageDirection.IN}>
                {Object.values(DataMessageDirection).map((direction) => (
                  <option key={direction} value={direction}>
                    {dataMessageDirectionLabels[direction]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Doručeno / odesláno">
              <TextInput name="deliveredAt" type="date" />
            </Field>
          </div>
          <Field label="Předmět zprávy">
            <TextInput name="messageSubject" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID datové zprávy (volitelné)">
              <TextInput name="dmId" />
            </Field>
            <Field label="ID schránky odesílatele/příjemce (volitelné)">
              <TextInput name="senderBoxId" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Příloha — název (volitelné)">
              <TextInput name="attachmentFileName" />
            </Field>
            <Field label="Příloha — odkaz/URL (volitelné)">
              <TextInput name="attachmentUrl" />
            </Field>
          </div>
          <Field label="Poznámka (volitelné)">
            <TextArea name="note" />
          </Field>
          <div>
            <Button type="submit">Zaevidovat zprávu</Button>
          </div>
        </form>
      </Section>
    </>
  );
}
