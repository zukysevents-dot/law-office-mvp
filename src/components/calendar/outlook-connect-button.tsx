"use client";

import { CalendarSync } from "lucide-react";
import { useState } from "react";

import { OutlookCalendarPanel } from "@/components/calendar/outlook-calendar-panel";
import { Dialog } from "@/components/ui/dialog";
import type { OutlookFeedSummary } from "@/lib/calendar/outlook-summary";
import { cn } from "@/lib/utils";

/** „Outlook" button in the calendar: opens the connection dialog. */
export function OutlookConnectButton({
  summary,
  onSummaryChange,
}: {
  summary: OutlookFeedSummary;
  onSummaryChange?: (summary: OutlookFeedSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const status = !summary.connected
    ? null
    : summary.errorMessage
      ? { className: "bg-amber-500", label: "Outlook: poslední aktualizace se nezdařila" }
      : { className: "bg-emerald-500", label: "Outlook je propojený" };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={status?.label ?? "Propojit Outlook kalendář"}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-[#0078d4] bg-white px-3 text-sm font-medium text-[#0b3a6e] transition hover:bg-[#e6f0fa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078d4]"
      >
        <CalendarSync className="h-4 w-4" aria-hidden="true" />
        Outlook
        {status ? (
          <span
            className={cn("h-2 w-2 rounded-full", status.className)}
            aria-hidden="true"
          />
        ) : null}
        {status ? <span className="sr-only">({status.label})</span> : null}
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Propojení s Outlookem"
        size="md"
      >
        <div className="px-4 py-4 sm:px-5">
          <OutlookCalendarPanel summary={summary} onSummaryChange={onSummaryChange} />
        </div>
      </Dialog>
    </>
  );
}
