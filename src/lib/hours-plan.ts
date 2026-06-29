// Výpočty pro plán vykázaných hodin (UserHoursPlan): „% plnění" na výkazech
// a denní koše pro týdenní graf na dashboardu. Čistá logika bez DB/Prisma,
// aby šla testovat samostatně.

export const DAY_MS = 24 * 60 * 60 * 1000;

// Po–Ne; index odpovídá dni v týdnu počítanému od pondělí.
export const WEEKDAY_LABELS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"] as const;

export type DayBucket = {
  label: string;
  date: Date;
  hours: number;
};

// Procento naplnění cíle. Cíl je null/0, dokud ho admin nenastaví — pak vrací
// null (% se nezobrazuje). Jinak zaokrouhlené procento odpracovaných hodin.
export function fulfillmentPercent(
  actualHours: number,
  targetHours: number | null | undefined,
): number | null {
  if (
    targetHours == null ||
    !Number.isFinite(targetHours) ||
    targetHours <= 0
  ) {
    return null;
  }

  return Math.round((actualHours / targetHours) * 100);
}

// Začátek aktuálního týdne (pondělí 00:00 UTC) v milisekundách. workDate se
// ukládá na UTC půlnoc, takže hranice i bucketování počítáme v UTC, aby úkon
// nespadl do vedlejšího dne kvůli časovému posunu.
export function weekStartUtcMs(now: Date): number {
  const weekday = (now.getUTCDay() + 6) % 7; // pondělí = 0
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - weekday,
  );
}

// Sedm košů (Po–Ne) se součtem odpracovaných hodin pro daný týden. Každý
// workDate leží přesně na UTC půlnoci, takže index dne = celé dny od začátku
// týdne. Úkony mimo týden se ignorují.
export function weeklyHoursBuckets(
  weekStartMs: number,
  entries: Array<{ workDate: Date; hours: number }>,
): DayBucket[] {
  const buckets: DayBucket[] = WEEKDAY_LABELS.map((label, index) => ({
    label,
    date: new Date(weekStartMs + index * DAY_MS),
    hours: 0,
  }));

  for (const entry of entries) {
    const index = Math.floor(
      (entry.workDate.getTime() - weekStartMs) / DAY_MS,
    );
    if (index >= 0 && index < buckets.length) {
      // Hodiny by neměly být záporné (vstup má min 0), ale defenzivně ořízneme,
      // ať graf nikdy nedostane zápornou výšku sloupce.
      buckets[index].hours += Math.max(0, entry.hours);
    }
  }

  return buckets;
}
