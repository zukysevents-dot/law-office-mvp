import { formatHours } from "@/lib/format";
import { fulfillmentPercent, type DayBucket } from "@/lib/hours-plan";
import { Badge } from "@/components/ui/badge";
import type { BadgeTone } from "@/components/ui/badge";

function fulfillmentTone(pct: number): BadgeTone {
  if (pct >= 100) {
    return "green";
  }
  if (pct >= 75) {
    return "amber";
  }
  return "red";
}

// Týdenní graf odpracovaných hodin (Po–Ne) pro přihlášeného uživatele.
// Server-rendered CSS sloupce — žádný klientský JS ani knihovna na grafy.
// Když je nastavený týdenní cíl, ukáže se referenční čára denního cíle
// (cíl/7) a % plnění za týden.
export function WeeklyHoursChart({
  buckets,
  weeklyTarget,
}: {
  buckets: DayBucket[];
  weeklyTarget: number | null;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.hours, 0);
  const dailyTarget =
    weeklyTarget != null && weeklyTarget > 0 ? weeklyTarget / 7 : null;
  // Měřítko zahrnuje i denní cíl, aby se referenční čára vešla do grafu.
  const maxValue = Math.max(
    ...buckets.map((bucket) => bucket.hours),
    dailyTarget ?? 0,
    0.001,
  );
  const pct = fulfillmentPercent(total, weeklyTarget);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xl font-semibold text-[#072924]">
          {formatHours(total)} h
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#5f756e]">
          {weeklyTarget != null && weeklyTarget > 0 ? (
            <span>z {formatHours(weeklyTarget)} h plánu</span>
          ) : (
            <span>Plán hodin nenastaven</span>
          )}
          {pct != null ? (
            <Badge tone={fulfillmentTone(pct)}>{pct} %</Badge>
          ) : null}
        </div>
      </div>
      <div className="relative flex h-40 items-end gap-2">
        {dailyTarget != null ? (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#072924]/40"
            style={{ bottom: `${(dailyTarget / maxValue) * 100}%` }}
            title={`Denní cíl ${formatHours(dailyTarget)} h`}
            aria-hidden="true"
          />
        ) : null}
        {buckets.map((bucket) => {
          const heightPct = (bucket.hours / maxValue) * 100;
          return (
            <div
              key={bucket.label}
              className="flex flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="text-xs font-medium text-[#5f756e]">
                {bucket.hours > 0 ? formatHours(bucket.hours) : ""}
              </span>
              <div
                className="w-full rounded-t bg-[#B9DCC6]"
                style={{ height: `${Math.max(heightPct, bucket.hours > 0 ? 4 : 0)}%` }}
                role="img"
                aria-label={`${bucket.label}: ${formatHours(bucket.hours)} h`}
              />
              <span className="text-xs text-[#5f756e]">{bucket.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
