"use client";

import { useCallback, useState } from "react";
import nextDynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type {
  EventClickArg,
  EventInput,
  EventSourceFuncArg,
} from "@fullcalendar/core";
import csLocale from "@fullcalendar/core/locales/cs";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";

import type { BadgeTone } from "@/components/ui/badge";
import { fetchCalendarEvents } from "@/app/actions/calendar";
import type { SerializedCalendarEvent } from "@/lib/calendar-events";
import type { CalendarDefaultView } from "@/lib/calendar-view";

// Load FullCalendar client-only: it touches the DOM, so this avoids SSR/
// hydration mismatches without a setState-in-effect mount gate.
const FullCalendar = nextDynamic(() => import("@fullcalendar/react"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="flex min-h-[28rem] items-center justify-center rounded-lg border border-[#dce4e8] bg-[#f4f7f8] text-sm font-medium text-[#566673] sm:min-h-[40rem]"
    >
      <span
        className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-[#17A2A2] border-t-[#0e1822] motion-reduce:animate-none"
        aria-hidden="true"
      />
      Načítání kalendáře…
    </div>
  ),
});

// Event colors mirror the Badge tones so the calendar stays on-brand.
const TONE_COLORS: Record<BadgeTone, { bg: string; border: string; text: string }> = {
  neutral: { bg: "#fafaf9", border: "#e7e5e4", text: "#44403c" },
  mint: { bg: "#dcede4", border: "#17a2a2", text: "#0e1822" },
  dark: { bg: "#0e1822", border: "#0e1822", text: "#ffffff" },
  green: { bg: "#ecfdf5", border: "#a7f3d0", text: "#064e3b" },
  amber: { bg: "#fffbeb", border: "#fde68a", text: "#78350f" },
  red: { bg: "#fef2f2", border: "#fecaca", text: "#7f1d1d" },
  blue: { bg: "#f0f9ff", border: "#bae6fd", text: "#0c4a6e" },
  purple: { bg: "#f5f3ff", border: "#ddd6fe", text: "#4c1d95" },
};

function toEventInput(event: SerializedCalendarEvent): EventInput {
  const colors = TONE_COLORS[event.tone] ?? TONE_COLORS.neutral;
  return {
    id: event.id,
    // Date-only string keeps the deadline on its stored UTC day (all-day),
    // independent of the viewer's timezone.
    start: event.dateIso.slice(0, 10),
    allDay: event.allDay,
    title: event.title,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    textColor: colors.text,
    classNames: event.status === "COMPLETED" ? ["fc-event-done"] : [],
    extendedProps: { href: event.href },
  };
}

export function CalendarView({
  compact = false,
  title,
  initialView = "dayGridMonth",
}: {
  compact?: boolean;
  title?: string;
  initialView?: CalendarDefaultView;
} = {}) {
  const router = useRouter();
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadEvents = useCallback(
    (
      info: EventSourceFuncArg,
      success: (events: EventInput[]) => void,
      failure: (error: Error) => void,
    ) => {
      setLoadError(null);
      fetchCalendarEvents(info.startStr, info.endStr)
        .then((events) => success(events.map(toEventInput)))
        .catch((error: unknown) => {
          setLoadError(
            "Události kalendáře se nepodařilo načíst. Zkuste načtení zopakovat.",
          );
          failure(error instanceof Error ? error : new Error("Calendar load failed"));
        });
    },
    [],
  );

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      arg.jsEvent.preventDefault();
      const href = arg.event.extendedProps.href as string | undefined;
      if (href) {
        router.push(href);
      }
    },
    [router],
  );

  return (
    <section className="min-w-0 space-y-3 rounded-lg border border-[#dce4e8] bg-white p-4 shadow-sm shadow-[#0e1822]/5">
      {title ? (
        <h2 className="text-lg font-semibold text-[#0e1822]">{title}</h2>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 text-xs text-[#566673]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" aria-hidden="true" />
          Procesní lhůta
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full bg-[#17a2a2]"
            aria-hidden="true"
          />
          Interní lhůta
        </span>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-red-300 bg-white px-4 font-medium text-red-900 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900"
          >
            Načíst znovu
          </button>
        </div>
      ) : null}

      <div className="calendar-shell min-w-0">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
          initialView={initialView}
          locale={csLocale}
          timeZone="UTC"
          firstDay={1}
          height="auto"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: compact
              ? "dayGridMonth,listWeek"
              : "dayGridMonth,timeGridWeek,timeGridDay,listYear",
          }}
          buttonText={{
            today: "Dnes",
            month: "Měsíc",
            week: "Týden",
            day: "Den",
            list: "Agenda",
          }}
          views={{ listYear: { buttonText: "Rok" } }}
          events={loadEvents}
          eventClick={handleEventClick}
          dayMaxEvents
          nowIndicator
          stickyHeaderDates
          expandRows
          slotLabelFormat={{
            hour: "numeric",
            minute: "2-digit",
            omitZeroMinute: false,
            hour12: false,
          }}
        />
      </div>
    </section>
  );
}
