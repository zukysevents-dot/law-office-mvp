import Link from "next/link";

import { acknowledgeRegistryChange } from "@/app/actions/registry";
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

type Data = { events: EventRow[] };

const emptyData: Data = { events: [] };

export default async function RegistryPage() {
  const result = await safeQuery<Data>(emptyData, async () => {
    const currentUser = await getCurrentUser();
    const prisma = getPrisma();

    // Unacknowledged changes whose subject the user may see (org isolation +
    // role visibility flow through subjectVisibilityWhere on the relation).
    const events = await prisma.registryChangeEvent.findMany({
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
    });

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
                    <span className="text-xs text-stone-400">
                      IČO {event.subject.ico}
                    </span>
                  ) : null}
                  <span className="text-xs text-stone-400">
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
