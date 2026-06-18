"use client";

import { useCallback } from "react";
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

// Load FullCalendar client-only: it touches the DOM, so this avoids SSR/
// hydration mismatches without a setState-in-effect mount gate.
const FullCalendar = nextDynamic(() => import("@fullcalendar/react"), {
  ssr: false,
  loading: () => (
    <div
      className="animate-pulse rounded-lg border border-[#d4e2dc] bg-[#eef5f1]"
      style={{ height: 760 }}
      aria-hidden="true"
    />
  ),
});

// Event colors mirror the Badge tones so the calendar stays on-brand.
const TONE_COLORS: Record<BadgeTone, { bg: string; border: string; text: string }> = {
  neutral: { bg: "#fafaf9", border: "#e7e5e4", text: "#44403c" },
  mint: { bg: "#dcede4", border: "#b9dcc6", text: "#072924" },
  dark: { bg: "#072924", border: "#072924", text: "#ffffff" },
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

export function CalendarView() {
  const router = useRouter();

  const loadEvents = useCallback(
    (
      info: EventSourceFuncArg,
      success: (events: EventInput[]) => void,
      failure: (error: Error) => void,
    ) => {
      fetchCalendarEvents(info.startStr, info.endStr)
        .then((events) => success(events.map(toEventInput)))
        .catch(failure);
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
    <section className="min-w-0 space-y-3 rounded-lg border border-[#d4e2dc] bg-white p-4 shadow-sm shadow-[#072924]/5">
      <div className="flex flex-wrap items-center gap-4 text-xs text-[#5f756e]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" aria-hidden="true" />
          Procesní lhůta
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full bg-[#b9dcc6]"
            aria-hidden="true"
          />
          Interní lhůta
        </span>
      </div>

      <div className="calendar-shell min-w-0">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
          initialView="dayGridMonth"
          locale={csLocale}
          timeZone="UTC"
          firstDay={1}
          height={760}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
          }}
          buttonText={{
            today: "Dnes",
            month: "Měsíc",
            week: "Týden",
            day: "Den",
            list: "Agenda",
          }}
          events={loadEvents}
          eventClick={handleEventClick}
          dayMaxEvents
          nowIndicator
          stickyHeaderDates
          expandRows
        />
      </div>
    </section>
  );
}
