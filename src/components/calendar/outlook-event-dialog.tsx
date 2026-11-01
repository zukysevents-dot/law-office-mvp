"use client";

import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export type OutlookEventDetail = {
  title: string;
  allDay: boolean;
  /** Wire values: "YYYY-MM-DD" or Prague "YYYY-MM-DDTHH:mm:ss". */
  start: string;
  end?: string;
  location?: string;
};

// The wire values are Prague wall clock pinned to UTC → format them in UTC.
const dayFormatter = new Intl.DateTimeFormat("cs-CZ", {
  weekday: "short",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const timeFormatter = new Intl.DateTimeFormat("cs-CZ", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function wireDate(wire: string) {
  return new Date(wire.length === 10 ? `${wire}T00:00:00Z` : `${wire}Z`);
}

/** „út 27. 10. 2026, 10:00–11:00" / „st 28. 10. 2026 · Celý den". */
export function formatOutlookEventWhen(event: OutlookEventDetail): string {
  const start = wireDate(event.start);
  if (event.allDay) {
    const end = event.end ? wireDate(event.end) : null;
    const lastDay = end ? new Date(end.getTime() - 24 * 60 * 60 * 1000) : start;
    const range =
      lastDay.getTime() > start.getTime()
        ? `${dayFormatter.format(start)} – ${dayFormatter.format(lastDay)}`
        : dayFormatter.format(start);
    return `${range} · Celý den`;
  }
  const end = event.end ? wireDate(event.end) : null;
  const sameDay = end && end.toISOString().slice(0, 10) === start.toISOString().slice(0, 10);
  if (!end || end.getTime() <= start.getTime()) {
    return `${dayFormatter.format(start)}, ${timeFormatter.format(start)}`;
  }
  return sameDay
    ? `${dayFormatter.format(start)}, ${timeFormatter.format(start)}–${timeFormatter.format(end)}`
    : `${dayFormatter.format(start)}, ${timeFormatter.format(start)} – ${dayFormatter.format(end)}, ${timeFormatter.format(end)}`;
}

/** Read-only detail of an Outlook event (they are edited in Outlook). */
export function OutlookEventDialog({
  event,
  onClose,
}: {
  event: OutlookEventDetail | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={event !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title="Událost z Outlooku"
      size="sm"
    >
      {event ? (
        <div className="grid gap-4 px-4 py-4 sm:px-5">
          <div className="grid gap-1">
            <p className="break-words text-base font-semibold text-[#0b3a6e]">
              {event.title}
            </p>
            <p className="text-sm text-[#2c3a45]">{formatOutlookEventWhen(event)}</p>
            {event.location ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-[#2c3a45]">
                <MapPin className="h-4 w-4 shrink-0 text-[#566673]" aria-hidden="true" />
                <span className="break-words">{event.location}</span>
              </p>
            ) : null}
          </div>
          <p className="rounded-md border border-[#bcd6ef] bg-[#e6f0fa] px-3 py-2 text-sm leading-6 text-[#0b3a6e]">
            Událost pochází z vašeho Outlook kalendáře a je jen pro čtení. Upravíte ji
            v Outlooku.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zavřít
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
