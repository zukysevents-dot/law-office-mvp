import Link from "next/link";

import {
  acknowledgeRegistryChange,
  checkSubjectRegistryNow,
  setSubjectRegistryWatch,
} from "@/app/actions/registry";
import { Field, SelectInput } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseNotice } from "@/components/ui/database-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth";
import { safeQuery } from "@/lib/db-safe";
import { formatDateTime } from "@/lib/format";
import { registryChangeTypeLabels } from "@/lib/labels";
import {
  andWhere,
  canEditRecord,
  canManageSubjects,
  subjectVisibilityWhere,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { registryChangeTypeTone } from "@/lib/status-tones";

export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  changeType: keyof typeof registryChangeTypeLabels;
  summary: string;
  detectedAt: Date;
  subject: { id: string; name: string; ico: string | null };
  canEdit: boolean;
};

type WatchedSubject = { id: string; name: string; ico: string | null };
type Data = {
  events: EventRow[];
  watched: WatchedSubject[];
  available: WatchedSubject[];
  canManage: boolean;
};

const emptyData: Data = {
  events: [],
  watched: [],
  available: [],
  canManage: false,
};

export default async function RegistryPage() {
  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    const prisma = getPrisma();

    // Unacknowledged changes whose subject the user may see (org isolation +
    // role visibility flow through subjectVisibilityWhere on the relation).
    const [events, watched, available] = await Promise.all([
      prisma.registryChangeEvent.findMany({
        where: andWhere(
          { acknowledgedAt: null },
          { subject: subjectVisibilityWhere(currentUser) },
        ),
        orderBy: { detectedAt: "desc" },
        take: 100,
        include: {
          subject: {
            select: { id: true, name: true, ico: true, organizationId: true },
          },
        },
      }),
      prisma.subject.findMany({
        where: andWhere(
          { archivedAt: null, registryWatchEnabled: true },
          subjectVisibilityWhere(currentUser),
        ),
        orderBy: { name: "asc" },
        select: { id: true, name: true, ico: true },
      }),
      prisma.subject.findMany({
        where: andWhere(
          { archivedAt: null, registryWatchEnabled: false, ico: { not: null } },
          subjectVisibilityWhere(currentUser),
        ),
        orderBy: { name: "asc" },
        select: { id: true, name: true, ico: true },
      }),
    ]);

    return {
      events: events.map((event) => ({
        id: event.id,
        changeType: event.changeType,
        summary: event.summary,
        detectedAt: event.detectedAt,
        subject: {
          id: event.subject.id,
          name: event.subject.name,
          ico: event.subject.ico,
        },
        canEdit: canEditRecord(currentUser, "Subject", event.subject),
      })),
      watched,
      available,
      canManage: canManageSubjects(currentUser),
    };
  });

  const data = result.data ?? emptyData;

  return (
    <>
      <PageHeader
        title="Hlídání rejstříků"
        description="Nepotvrzené změny v rejstřících (ISIR/OR) u sledovaných subjektů."
      />
      <DatabaseNotice databaseReady={result.databaseReady} error={result.error} />

      <Section title={`Sledované subjekty (${data.watched.length})`}>
        {data.canManage && data.available.length > 0 ? (
          <form action={setSubjectRegistryWatch} className="mb-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="enabled" value="true" />
            <Field label="Přidat sledovaný subjekt">
              <SelectInput name="subjectId" required>
                <option value="">Vyberte subjekt</option>
                {data.available.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}{subject.ico ? `, IČO ${subject.ico}` : ""}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Button type="submit">Přidat sledování</Button>
          </form>
        ) : null}
        {data.watched.length > 0 ? (
          <div className="table-scroll">
            <table className="w-max min-w-full">
              <thead>
                <tr>
                  <th>Subjekt</th>
                  <th>IČO</th>
                  {data.canManage ? <th>Akce</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.watched.map((subject) => (
                  <tr key={subject.id}>
                    <td>
                      <Link
                        href={`/subjects/${subject.id}`}
                        className="font-medium text-[#072924] hover:underline"
                      >
                        {subject.name}
                      </Link>
                    </td>
                    <td className="font-mono text-sm">{subject.ico ?? "—"}</td>
                    {data.canManage ? (
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <form action={checkSubjectRegistryNow}>
                            <input type="hidden" name="subjectId" value={subject.id} />
                            <Button type="submit" variant="secondary" className="h-8 px-3">
                              Zkontrolovat
                            </Button>
                          </form>
                          <form action={setSubjectRegistryWatch}>
                            <input type="hidden" name="subjectId" value={subject.id} />
                            <input type="hidden" name="enabled" value="false" />
                            <Button type="submit" variant="ghost" className="h-8 px-3">
                              Odebrat
                            </Button>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Zatím není sledovaný žádný subjekt.</EmptyState>
        )}
      </Section>

      <Section title={`Nepotvrzené změny (${data.events.length})`}>
        {data.events.length > 0 ? (
          <ul className="space-y-2">
            {data.events.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-[#d4e2dc] bg-white p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={registryChangeTypeTone(event.changeType)}>
                    {registryChangeTypeLabels[event.changeType]}
                  </Badge>
                  <Link
                    href={`/subjects/${event.subject.id}`}
                    className="text-sm font-medium text-[#072924] underline-offset-2 hover:underline"
                  >
                    {event.subject.name}
                  </Link>
                  {event.subject.ico ? (
                    <span className="text-xs text-stone-600">
                      IČO {event.subject.ico}
                    </span>
                  ) : null}
                  <span className="text-xs text-stone-600">
                    {formatDateTime(event.detectedAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-700">{event.summary}</p>
                {event.canEdit ? (
                  <form action={acknowledgeRegistryChange} className="mt-2">
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button type="submit" variant="ghost" className="h-8 px-3">
                      Potvrdit
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>
            Žádné nepotvrzené změny v rejstřících. Hlídání běží na pozadí.
          </EmptyState>
        )}
      </Section>
    </>
  );
}
