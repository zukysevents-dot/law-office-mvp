"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import nextDynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type {
  EventClickArg,
  EventInput,
  EventSourceFuncArg,
  EventSourceInput,
} from "@fullcalendar/core";
import csLocale from "@fullcalendar/core/locales/cs";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";

import type { BadgeTone } from "@/components/ui/badge";
import {
  fetchCalendarEvents,
  fetchOutlookCalendarEvents,
} from "@/app/actions/calendar";
import { OutlookConnectButton } from "@/components/calendar/outlook-connect-button";
import {
  OutlookEventDialog,
  type OutlookEventDetail,
} from "@/components/calendar/outlook-event-dialog";
import type { SerializedCalendarEvent } from "@/lib/calendar-events";
import { requestOutlookRefresh } from "@/lib/calendar/outlook-refresh-client";
import type {
  OutlookFeedSummary,
  OutlookRefreshResponse,
} from "@/lib/calendar/outlook-summary";
import { toDisplayWallIso } from "@/lib/calendar/windows-time-zones";
import type { CalendarDefaultView } from "@/lib/calendar-view";
import { useDismissOnOutside } from "@/lib/use-dismiss-on-outside";

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

// The grid shows Prague wall clock pinned to UTC (timeZone="UTC"), so "now"
// (today highlight, now indicator) must be the Prague wall clock too.
function pragueNow() {
  return toDisplayWallIso(new Date());
}

// Outlook events: Microsoft's blue, so they are told apart at a glance.
const OUTLOOK_COLORS = { bg: "#e6f0fa", border: "#0078d4", text: "#0b3a6e" };

function toEventInput(event: SerializedCalendarEvent): EventInput {
  const outlook = event.kind === "outlook";
  const colors = outlook
    ? OUTLOOK_COLORS
    : (TONE_COLORS[event.tone] ?? TONE_COLORS.neutral);
  const classNames: string[] = [];
  if (event.status === "COMPLETED") {
    classNames.push("fc-event-done");
  }
  if (outlook) {
    classNames.push("fc-event-outlook");
  }
  return {
    id: event.id,
    // Server-computed wire values: the stored UTC day for all-day events,
    // the UTC-pinned wall clock (no zone suffix) for timed ones — FullCalendar
    // runs with timeZone="UTC", so neither shifts with the viewer's zone.
    start: event.start ?? event.dateIso.slice(0, 10),
    end: event.end,
    allDay: event.allDay,
    title: event.title,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    textColor: colors.text,
    classNames,
    editable: false,
    extendedProps: {
      href: event.href,
      kind: event.kind,
      location: event.location,
      startWire: event.start,
      endWire: event.end,
      tooltip: event.tooltip,
    },
  };
}

// „Outlook" legend toggle, remembered per browser. useSyncExternalStore keeps
// the server render (always "on") and the stored value hydration-safe.
const OUTLOOK_TOGGLE_KEY = "iv.calendar.outlook";
const OUTLOOK_TOGGLE_EVENT = "iv-calendar-outlook-toggle";

// Fallback when localStorage is blocked: the choice lives for this page only.
let outlookToggleFallback = true;

function outlookToggleSnapshot(): boolean {
  try {
    return window.localStorage.getItem(OUTLOOK_TOGGLE_KEY) !== "0";
  } catch {
    return outlookToggleFallback;
  }
}

function writeOutlookToggle(on: boolean) {
  outlookToggleFallback = on;
  try {
    window.localStorage.setItem(OUTLOOK_TOGGLE_KEY, on ? "1" : "0");
  } catch {
    // Storage blocked (private mode…) — the fallback above keeps it working.
  }
  window.dispatchEvent(new Event(OUTLOOK_TOGGLE_EVENT));
}

function subscribeOutlookToggle(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(OUTLOOK_TOGGLE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(OUTLOOK_TOGGLE_EVENT, callback);
  };
}

export function CalendarView({
  compact = false,
  title,
  initialView = "dayGridMonth",
  outlook = null,
}: {
  compact?: boolean;
  title?: string;
  initialView?: CalendarDefaultView;
  /** The viewer's own Outlook connection (null = feature unavailable). */
  outlook?: OutlookFeedSummary | null;
} = {}) {
  const router = useRouter();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outlookError, setOutlookError] = useState<string | null>(null);
  const [outlookSummary, setOutlookSummary] = useState(outlook);
  const [previousOutlookProp, setPreviousOutlookProp] = useState(outlook);
  // Bumping the version gives the Outlook source a new id → FullCalendar
  // refetches just that source (next/dynamic doesn't forward refs to getApi()).
  const [outlookVersion, setOutlookVersion] = useState(0);
  const [outlookEvent, setOutlookEvent] = useState<OutlookEventDetail | null>(null);
  const showOutlook = useSyncExternalStore(
    subscribeOutlookToggle,
    outlookToggleSnapshot,
    () => true,
  );

  // The page re-rendered after connect/disconnect/replace → new summary and a
  // fresh Outlook fetch.
  if (outlook !== previousOutlookProp) {
    setPreviousOutlookProp(outlook);
    setOutlookSummary(outlook);
    setOutlookVersion((version) => version + 1);
  }

  const outlookConnected = Boolean(outlookSummary?.connected);
  const outlookStale = Boolean(outlookSummary?.connected && outlookSummary.stale);

  // A fresh summary from a refresh (background or „Obnovit teď"): show its
  // state and refetch only the Outlook source when new data may have arrived.
  // Ignored once the user disconnected meanwhile.
  const applyRefresh = useCallback((result: OutlookRefreshResponse) => {
    setOutlookSummary((current) => (current?.connected ? result.summary : current));
    if (result.outcome === "refreshed") {
      setOutlookVersion((version) => version + 1);
    }
  }, []);

  // A stale cache (> 10 min) is refreshed in the background once per mount;
  // the cached events are already shown meanwhile. requestOutlookRefresh is a
  // plain fetch to a Route Handler — never a server action, which would queue
  // every event fetch of the calendar behind the up-to-10-s ICS download.
  useEffect(() => {
    if (!outlookStale) {
      return;
    }
    requestOutlookRefresh(false)
      .then((result) => {
        if (result) {
          applyRefresh(result);
        }
      })
      .catch(() => {
        // Non-blocking: the cached events stay visible.
      });
    // Only on mount / when the connection itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlookConnected]);

  const handleOutlookSummaryChange = useCallback((fresh: OutlookFeedSummary) => {
    setOutlookSummary(fresh);
    setOutlookVersion((version) => version + 1);
  }, []);

  // FullCalendar's "+N další" popover closes itself on an outside mousedown,
  // but the click then went through to whatever was underneath (e.g. an event
  // → navigation). Swallow that click and close the popover; Escape closes too.
  useDismissOnOutside({
    active: true,
    // FullCalendar may mount the popover outside the calendar root, so look
    // it up document-wide (there is one calendar per page).
    getPanels: () => Array.from(document.querySelectorAll(".fc-popover")),
    onDismiss: () => {
      document
        .querySelector<HTMLElement>(".fc-popover .fc-popover-close")
        ?.click();
    },
  });

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

  const loadOutlook = useCallback(
    (
      info: EventSourceFuncArg,
      success: (events: EventInput[]) => void,
    ) => {
      setOutlookError(null);
      fetchOutlookCalendarEvents(info.startStr, info.endStr)
        .then((events) => success(events.map(toEventInput)))
        .catch(() => {
          // Never the blocking red alert: the office calendar still works.
          setOutlookError("Události z Outlooku se teď nepodařilo načíst.");
          success([]);
        });
    },
    [],
  );

  const iuriverseSource = useMemo<EventSourceInput>(
    () => ({ id: "iuriverse", events: loadEvents }),
    [loadEvents],
  );

  const eventSources = useMemo<EventSourceInput[]>(
    () =>
      outlookConnected && showOutlook
        ? [
            iuriverseSource,
            {
              id: `outlook-${outlookVersion}`,
              events: loadOutlook,
              editable: false,
              className: "fc-event-outlook",
            },
          ]
        : [iuriverseSource],
    [iuriverseSource, loadOutlook, outlookConnected, outlookVersion, showOutlook],
  );

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      arg.jsEvent.preventDefault();
      if (arg.event.extendedProps.kind === "outlook") {
        setOutlookEvent({
          title: arg.event.title,
          allDay: arg.event.allDay,
          start: (arg.event.extendedProps.startWire as string | undefined) ?? arg.event.startStr,
          end: arg.event.extendedProps.endWire as string | undefined,
          location: arg.event.extendedProps.location as string | undefined,
        });
        return;
      }
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#566673]">
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
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-300" aria-hidden="true" />
          Soudní jednání
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-stone-300" aria-hidden="true" />
          <span className="line-through">Splněná lhůta</span>
        </span>
        {outlookConnected ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-[#0b3a6e]">
            <input
              type="checkbox"
              checked={showOutlook}
              onChange={(event) => writeOutlookToggle(event.target.checked)}
              className="h-4 w-4 accent-[#0078d4]"
            />
            <span
              className="h-2.5 w-2.5 rounded-full bg-[#0078d4]"
              aria-hidden="true"
            />
            Outlook
          </label>
        ) : null}
        {!compact && outlookSummary ? (
          <span className="ml-auto">
            <OutlookConnectButton
              summary={outlookSummary}
              onSummaryChange={handleOutlookSummaryChange}
            />
          </span>
        ) : null}
      </div>

      {outlookError && showOutlook ? (
        <p
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {outlookError}
        </p>
      ) : null}

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
            // buttonText.list beats views.*.buttonText in FullCalendar, so
            // the year list must be named here (settings calls it „Rok").
            list: compact ? "Agenda" : "Rok",
          }}
          eventSources={eventSources}
          editable={false}
          eventClick={handleEventClick}
          eventDidMount={(info) => {
            // Tooltip: u úkolu „{název} – Řešitelé: A, B; Dohled: C“.
            const tooltip = info.event.extendedProps.tooltip as string | undefined;
            if (tooltip) {
              info.el.title = tooltip;
            }
          }}
          dayMaxEvents
          closeHint="Zavřít"
          moreLinkHint={(count: number) => `Zobrazit další události (${count})`}
          nowIndicator
          now={pragueNow}
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
      <OutlookEventDialog event={outlookEvent} onClose={() => setOutlookEvent(null)} />
    </section>
  );
}
