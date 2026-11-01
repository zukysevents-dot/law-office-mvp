import {
  HrAbsenceStatus,
  HrAbsenceType,
  HrPresenceStatus,
} from "@/generated/prisma/enums";
import { officeWeekStartUtcMs, DAY_MS } from "@/lib/hours-plan";
import { hrPresenceStatusLabels } from "@/lib/labels";

// Čistá logika plánování přítomnosti (bez DB). Den v přehledu má jedinou
// výslednou hodnotu: schválená (nebo vlastní čekající) žádost o absenci má
// přednost před plánem — nepřítomnost se zadává jen jednou, žádostí v HR →
// Absence, a plánovač ji jen zobrazí.

export const PRESENCE_NOTE_MAX = 200;
export const PRESENCE_WORKDAYS = 5; // Po–Pá

export type PresenceKind =
  | "OFFICE"
  | "HOME_OFFICE"
  | "OUT_OF_OFFICE"
  | "ABSENCE"
  | "NONE";

export type PresenceCell = {
  date: string; // YYYY-MM-DD
  kind: PresenceKind;
  source: "plan" | "absence" | "none";
  label: string;
  note: string | null;
  pending: boolean;
  halfDay: boolean;
};

export const presenceKindLabels: Record<PresenceKind, string> = {
  OFFICE: "V kanceláři",
  HOME_OFFICE: "Home office",
  OUT_OF_OFFICE: "Mimo kancelář",
  ABSENCE: "Nepřítomen",
  NONE: "Nevyplněno",
};

export type PresencePlanRow = {
  employeeId: string;
  date: Date;
  status: HrPresenceStatus;
  note: string | null;
};

export type PresenceAbsenceRow = {
  employeeId: string;
  type: HrAbsenceType;
  status: HrAbsenceStatus;
  startDate: Date;
  endDate: Date;
  halfDay: boolean;
};

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcMidnight(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// Parametr ?week=YYYY-MM-DD → pondělí daného týdne (UTC půlnoc). Neplatná nebo
// chybějící hodnota → aktuální kancelářský týden (Europe/Prague).
export function parseWeekStart(value: string | null | undefined, now: Date): number {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isFinite(ms) && toDateKey(new Date(ms)) === value) {
      const day = new Date(ms).getUTCDay(); // 0 = Ne
      const offset = (day + 6) % 7; // dní od pondělí
      return utcMidnight(ms) - offset * DAY_MS;
    }
  }
  return officeWeekStartUtcMs(now);
}

// Pracovní dny (Po–Pá) týdne od `weekStartMs` jako UTC půlnoci.
export function weekWorkdays(weekStartMs: number): Date[] {
  return Array.from(
    { length: PRESENCE_WORKDAYS },
    (_, index) => new Date(weekStartMs + index * DAY_MS),
  );
}

function absenceCovers(absence: PresenceAbsenceRow, dayMs: number): boolean {
  return (
    utcMidnight(absence.startDate.getTime()) <= dayMs &&
    dayMs <= utcMidnight(absence.endDate.getTime())
  );
}

// Absence platná pro plánovač: schválená, nebo čekající (ta se ukáže
// s příznakem „čeká na schválení“). Zamítnuté a zrušené se ignorují.
export function isBlockingAbsence(absence: { status: HrAbsenceStatus }): boolean {
  return (
    absence.status === HrAbsenceStatus.APPROVED ||
    absence.status === HrAbsenceStatus.PENDING
  );
}

// Popisek absence. Kolegům se typ neukazuje (nemoc, lékař jsou citlivé
// údaje) — jen „Nepřítomen“; home office jako home office.
export function absenceLabel(
  type: HrAbsenceType,
  revealType: boolean,
  typeLabels: Record<HrAbsenceType, string>,
): string {
  if (type === HrAbsenceType.HOME_OFFICE) {
    return presenceKindLabels.HOME_OFFICE;
  }
  return revealType ? typeLabels[type] : presenceKindLabels.ABSENCE;
}

export function resolvePresenceCell(input: {
  day: Date;
  plan: PresencePlanRow | null | undefined;
  absences: readonly PresenceAbsenceRow[];
  revealAbsenceType: boolean;
  typeLabels: Record<HrAbsenceType, string>;
}): PresenceCell {
  const dayMs = utcMidnight(input.day.getTime());
  const date = toDateKey(new Date(dayMs));
  const covering = input.absences.filter(
    (absence) => isBlockingAbsence(absence) && absenceCovers(absence, dayMs),
  );
  // Schválená má přednost před čekající.
  const absence =
    covering.find((row) => row.status === HrAbsenceStatus.APPROVED) ??
    covering[0];

  if (absence) {
    return {
      date,
      kind: absence.type === HrAbsenceType.HOME_OFFICE ? "HOME_OFFICE" : "ABSENCE",
      source: "absence",
      label: absenceLabel(absence.type, input.revealAbsenceType, input.typeLabels),
      // Poznámka plánu zůstává (např. „dopoledne soud“ u půldenní absence).
      note: input.plan?.note ?? null,
      pending: absence.status === HrAbsenceStatus.PENDING,
      halfDay: absence.halfDay,
    };
  }

  if (input.plan) {
    return {
      date,
      kind: input.plan.status,
      source: "plan",
      label: hrPresenceStatusLabels[input.plan.status],
      note: input.plan.note,
      pending: false,
      halfDay: false,
    };
  }

  return {
    date,
    kind: "NONE",
    source: "none",
    label: presenceKindLabels.NONE,
    note: null,
    pending: false,
    halfDay: false,
  };
}

export type PresenceEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
};

export type PresenceRow = {
  employee: PresenceEmployee;
  cells: PresenceCell[];
};

// Týmový přehled: řádek za zaměstnance, buňka za pracovní den. Typ absence
// vidí správce HR a dotyčný sám (`viewerUserId`), ostatní jen „Nepřítomen“.
export function buildPresenceRows(input: {
  employees: readonly PresenceEmployee[];
  days: readonly Date[];
  plans: readonly PresencePlanRow[];
  absences: readonly PresenceAbsenceRow[];
  viewerUserId: string;
  viewerIsHrManager: boolean;
  typeLabels: Record<HrAbsenceType, string>;
}): PresenceRow[] {
  const planByKey = new Map<string, PresencePlanRow>();
  for (const plan of input.plans) {
    planByKey.set(`${plan.employeeId}|${toDateKey(plan.date)}`, plan);
  }
  const absencesByEmployee = new Map<string, PresenceAbsenceRow[]>();
  for (const absence of input.absences) {
    const list = absencesByEmployee.get(absence.employeeId) ?? [];
    list.push(absence);
    absencesByEmployee.set(absence.employeeId, list);
  }

  return input.employees.map((employee) => {
    const revealAbsenceType =
      input.viewerIsHrManager ||
      (employee.userId !== null && employee.userId === input.viewerUserId);
    const absences = absencesByEmployee.get(employee.id) ?? [];
    return {
      employee,
      cells: input.days.map((day) =>
        resolvePresenceCell({
          day,
          plan: planByKey.get(`${employee.id}|${toDateKey(day)}`),
          absences,
          revealAbsenceType,
          typeLabels: input.typeLabels,
        }),
      ),
    };
  });
}

// Souhrn dne: kolik lidí bude v kanceláři / na home office / mimo / pryč.
export function summarizePresenceDay(
  rows: readonly PresenceRow[],
  dayIndex: number,
): Record<PresenceKind, number> {
  const summary: Record<PresenceKind, number> = {
    OFFICE: 0,
    HOME_OFFICE: 0,
    OUT_OF_OFFICE: 0,
    ABSENCE: 0,
    NONE: 0,
  };
  for (const row of rows) {
    const cell = row.cells[dayIndex];
    if (cell) {
      summary[cell.kind] += 1;
    }
  }
  return summary;
}

export type PresencePlanEntry = {
  date: string;
  status: HrPresenceStatus | null; // null = smazat plán dne
  note: string | null;
};

// Formulář „Můj plán“: pole status_YYYY-MM-DD a note_YYYY-MM-DD pro každý
// den týdne. Bere se jen `allowedDates` (dny zobrazeného týdne), neznámý
// status = prázdný den (smazání plánu). Poznámka bez statusu se zahodí.
export function parsePresencePlanEntries(
  get: (key: string) => FormDataEntryValue | null,
  allowedDates: readonly string[],
): PresencePlanEntry[] {
  const statuses = Object.values(HrPresenceStatus) as string[];
  return allowedDates.map((date) => {
    const rawStatus = get(`status_${date}`);
    const status =
      typeof rawStatus === "string" && statuses.includes(rawStatus)
        ? (rawStatus as HrPresenceStatus)
        : null;
    const rawNote = get(`note_${date}`);
    const note =
      status && typeof rawNote === "string" && rawNote.trim()
        ? rawNote.trim()
        : null;
    if (note && note.length > PRESENCE_NOTE_MAX) {
      throw new Error(`Poznámka může mít nejvýš ${PRESENCE_NOTE_MAX} znaků.`);
    }
    return { date, status, note };
  });
}
