export const calendarViewOptions = [
  { value: "timeGridDay", label: "Den" },
  { value: "timeGridWeek", label: "Týden" },
  { value: "dayGridMonth", label: "Měsíc" },
  { value: "listYear", label: "Rok" },
] as const;

export type CalendarDefaultView = (typeof calendarViewOptions)[number]["value"];

const calendarViews = new Set<string>(
  calendarViewOptions.map((option) => option.value),
);

export function normalizeCalendarView(value: unknown): CalendarDefaultView {
  return typeof value === "string" && calendarViews.has(value)
    ? (value as CalendarDefaultView)
    : "dayGridMonth";
}
