import { Badge } from "@/components/ui/badge";
import { formatHours } from "@/lib/format";
import { fulfillmentTone } from "@/lib/status-tones";

const BAR_TONE = {
  green: "bg-emerald-600",
  amber: "bg-amber-500",
  red: "bg-red-600",
} as const;

// Buňka KPI: skutečnost / cíl, odznak % plnění a tenký ukazatel plnění.
// Bez cíle „32,5 h · plán nenastaven“.
export function KpiCell({
  actual,
  target,
  pct,
  hint,
}: {
  actual: number;
  target: number | null;
  pct: number | null;
  hint?: string;
}) {
  if (target == null || pct == null) {
    return (
      <div className="grid gap-0.5" data-kpi-cell>
        <span className="font-medium text-[#0e1822] tabular-nums">{formatHours(actual)} h</span>
        <span className="text-xs text-[#566673]">plán nenastaven</span>
        {hint ? <span className="text-xs text-[#566673]">{hint}</span> : null}
      </div>
    );
  }
  const tone = fulfillmentTone(pct);
  return (
    <div className="grid min-w-[9.5rem] gap-1" data-kpi-cell>
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap tabular-nums text-[#0e1822]">
          <span className="font-medium">{formatHours(actual)}</span>
          <span className="text-[#566673]"> / {formatHours(target)} h</span>
        </span>
        <Badge tone={tone} className="whitespace-nowrap">{pct} %</Badge>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[#e6ecef]"
        role="progressbar"
        aria-label="Plnění cíle"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        aria-valuetext={`${pct} %`}
      >
        <div
          className={`h-full rounded-full ${BAR_TONE[tone as keyof typeof BAR_TONE] ?? "bg-[#17A2A2]"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {hint ? <span className="text-xs text-[#566673]">{hint}</span> : null}
    </div>
  );
}
