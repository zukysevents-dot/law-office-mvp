import { round2 } from "@/lib/billing-calc";

// Čistá logika pro vyúčtování paušálu (retainer) s hodinovým přesahem. Bez DB
// a bez clock — plně unit-testovatelné (node --test), sdílené akcí i náhledem.

export type RetainerWorkLog = { id: string; hours: number };

export type RetainerSplit = {
  coveredIds: string[];
  overageIds: string[];
  coveredHours: number;
  overageHours: number;
};

// Rozdělí work-logy období na kryté paušálem (do includedHours) a přesah.
// Work-logy MUSÍ přijít seřazené deterministicky (workDate asc, createdAt asc,
// id asc) — pořadí určuje, které hodiny padnou do krytí.
// includedHours = null → neomezené krytí (vše kryté, přesah 0).
// includedHours = 0 → žádné krytí (vše přesah).
// Hraniční work-log se NEDĚLÍ: pokud jeho začátek leží pod cap, jde celý do
// krytých (coveredHours pak může mírně přesáhnout includedHours) — drží to
// 1:1 vazbu work-log ↔ režim a zjednodušuje storno.
export function computeRetainerSplit(
  includedHours: number | null,
  workLogs: RetainerWorkLog[],
): RetainerSplit {
  const cap =
    includedHours == null || !Number.isFinite(includedHours)
      ? Number.POSITIVE_INFINITY
      : Math.max(0, includedHours);

  const coveredIds: string[] = [];
  const overageIds: string[] = [];
  let coveredHours = 0;
  let overageHours = 0;
  let acc = 0;

  for (const workLog of workLogs) {
    const hours = round2(workLog.hours);
    if (acc < cap) {
      coveredIds.push(workLog.id);
      coveredHours = round2(coveredHours + hours);
      acc = round2(acc + hours);
    } else {
      overageIds.push(workLog.id);
      overageHours = round2(overageHours + hours);
    }
  }

  return { coveredIds, overageIds, coveredHours, overageHours };
}

// "YYYY-MM" → { year, month(1-12) }; když chybí/neplatné, aktuální měsíc v UTC.
export function parseRetainerPeriod(
  input: string | null | undefined,
  now: Date,
): { year: number; month: number } {
  if (input && /^\d{4}-\d{2}$/.test(input)) {
    const year = Number(input.slice(0, 4));
    const month = Number(input.slice(5, 7));
    if (month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

// Hranice měsíce [gte, lt) v UTC. workDate je uložený na UTC půlnoc, takže
// hranice počítáme v UTC, aby úkon z 1. dne nespadl do vedlejšího měsíce.
export function retainerPeriodBounds(
  year: number,
  month: number,
): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

export function formatRetainerPeriod(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}
