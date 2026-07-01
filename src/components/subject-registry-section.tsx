import {
  acknowledgeRegistryChange,
  checkSubjectRegistryNow,
  setSubjectRegistryWatch,
} from "@/app/actions/registry";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RegistryChangeType } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";
import { registryChangeTypeLabels } from "@/lib/labels";
import { registryChangeTypeTone } from "@/lib/status-tones";

export type RegistryEvent = {
  id: string;
  changeType: RegistryChangeType;
  summary: string;
  detectedAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedBy: { name: string } | null;
};

export function SubjectRegistrySection({
  subjectId,
  watchEnabled,
  checkedAt,
  hasIco,
  events,
  canEdit,
}: {
  subjectId: string;
  watchEnabled: boolean;
  checkedAt: Date | null;
  hasIco: boolean;
  events: RegistryEvent[];
  canEdit: boolean;
}) {
  return (
    <Section title="Hlídání rejstříků">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={watchEnabled ? "mint" : "neutral"}>
          {watchEnabled ? "Hlídání zapnuto" : "Hlídání vypnuto"}
        </Badge>
        <span className="text-sm text-stone-600">
          Poslední kontrola:{" "}
          {checkedAt ? formatDateTime(checkedAt) : "zatím neproběhla"}
        </span>
      </div>

      {!hasIco ? (
        <p className="mt-3 text-sm text-stone-600">
          Hlídání rejstříků vyžaduje vyplněné IČO subjektu.
        </p>
      ) : null}

      {canEdit ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={setSubjectRegistryWatch}>
            <input type="hidden" name="subjectId" value={subjectId} />
            <input
              type="hidden"
              name="enabled"
              value={watchEnabled ? "false" : "true"}
            />
            <Button type="submit" variant="secondary">
              {watchEnabled ? "Vypnout hlídání" : "Zapnout hlídání"}
            </Button>
          </form>
          {hasIco ? (
            <form action={checkSubjectRegistryNow}>
              <input type="hidden" name="subjectId" value={subjectId} />
              <Button type="submit" variant="ghost">
                Zkontrolovat teď
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-[#072924]">
          Zjištěné změny
        </p>
        {events.length > 0 ? (
          <ul className="space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-[#d4e2dc] bg-white p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={registryChangeTypeTone(event.changeType)}>
                    {registryChangeTypeLabels[event.changeType]}
                  </Badge>
                  <span className="text-xs text-stone-400">
                    {formatDateTime(event.detectedAt)}
                  </span>
                  {event.acknowledgedAt ? (
                    <Badge tone="neutral">
                      Potvrzeno
                      {event.acknowledgedBy
                        ? ` · ${event.acknowledgedBy.name}`
                        : ""}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-stone-700">{event.summary}</p>
                {canEdit && !event.acknowledgedAt ? (
                  <form
                    action={acknowledgeRegistryChange}
                    className="mt-2"
                  >
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
          <p className="text-sm text-stone-600">
            Zatím žádné zjištěné změny v rejstříku.
          </p>
        )}
      </div>
    </Section>
  );
}
