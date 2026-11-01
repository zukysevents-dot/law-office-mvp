// České tvary podle počtu: [1, 2–4, 0 a 5+], např.
// czechPlural(3, ["člen", "členové", "členů"]) → "členové".
// Samostatný modul bez závislostí, aby ho mohly použít i klientské komponenty
// (src/lib/format.ts táhne runtime Prismy).
export function czechPlural(
  count: number,
  forms: readonly [one: string, few: string, many: string],
): string {
  const n = Math.abs(Math.trunc(count));
  if (n === 1) {
    return forms[0];
  }
  if (n >= 2 && n <= 4) {
    return forms[1];
  }
  return forms[2];
}

// „3 členové", „1 člen", „0 členů".
export function countLabel(
  count: number,
  forms: readonly [one: string, few: string, many: string],
): string {
  return `${count} ${czechPlural(count, forms)}`;
}
