import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { formatHours } from "@/lib/format";
import { fulfillmentPercent, type HoursKpiBucket } from "@/lib/hours-plan";
import { fulfillmentTone } from "@/lib/status-tones";
import { cn } from "@/lib/utils";

// Sloupcový graf KPI hodin (dashboard „Přehled hodin“, detail na stránce
// Výkonnost). Čisté CSS na serveru, bez knihovny a bez klientského JS.
//
// Oprava „místo pro sloupce, ale nejsou tam“: starý graf měl buňky ve flexu
// s items-end bez definované výšky, takže `height: X%` sloupce se počítalo
// z auto výšky a vycházelo 0 px. Tady jsou buňky v gridu roztažené na výšku
// plotu (h-full) a segmenty jsou absolutně od spodu — procenta mají vždy
// definitní základ.
//
// Barvy ověřené validátorem (dataviz): fakturovatelné #28508f, nefakturovatelné
// #17A2A2 (obě ≥ 3:1 na bílé, CVD ΔE 23). Cíle jsou referenční čáry v barvě
// textu/akcentu rozlišené vzorem (přerušovaná = celkem, tečkovaná =
// fakturovatelné), s bílým lemem, aby byly vidět i přes sloupec.

const BILLABLE_COLOR = "#28508f";
const NON_BILLABLE_COLOR = "#17A2A2";
const TARGET_TOTAL_COLOR = "#0e1822";
const TARGET_BILLABLE_COLOR = "#b45309";

export type HoursKpiSummary = {
  label: string; // „Tento týden“ / „Tento měsíc“ / „Období“
  total: number;
  billable: number;
  totalTarget: number | null;
  billableTarget: number | null;
};

const NICE_STEPS = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500];

function niceScale(maxValue: number) {
  const max = Math.max(maxValue, 1);
  const raw = max / 3;
  const step = NICE_STEPS.find((candidate) => candidate >= raw) ?? Math.ceil(raw / 100) * 100;
  const top = Math.ceil((max * 1.08) / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + 1e-9; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  return { top, ticks };
}

function pctOf(value: number, top: number) {
  return Math.max(0, Math.min(100, (value / top) * 100));
}

function visiblePct(value: number, top: number) {
  if (value <= 0) {
    return 0;
  }
  return Math.max(2, pctOf(value, top));
}

function bucketAriaLabel(bucket: HoursKpiBucket) {
  const parts = [
    `${bucket.label}: ${formatHours(bucket.total)} h`,
    `z toho fakturovatelné ${formatHours(bucket.billable)} h`,
  ];
  if (bucket.totalTarget != null && bucket.totalTarget > 0) {
    parts.push(`cíl ${formatHours(bucket.totalTarget)} h`);
  }
  if (bucket.billableTarget != null && bucket.billableTarget > 0) {
    parts.push(`cíl fakturovatelných ${formatHours(bucket.billableTarget)} h`);
  }
  return parts.join(", ");
}

function SummaryRow({
  label,
  value,
  target,
  kind,
}: {
  label: string;
  value: number;
  target: number | null;
  kind: "total" | "billable";
}) {
  const pct = fulfillmentPercent(value, target);
  return (
    <p
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-[#566673]"
      data-kpi-summary={kind}
    >
      <span className="font-medium text-[#0e1822]">{label}</span>
      <span className="text-xl font-semibold text-[#0e1822]">
        {formatHours(value)} h
      </span>
      {target != null ? (
        <span>z {formatHours(target)} h</span>
      ) : (
        <span>plán nenastaven</span>
      )}
      {pct != null ? <Badge tone={fulfillmentTone(pct)}>{pct} %</Badge> : null}
    </p>
  );
}

function LegendSwatch({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" className={cn("inline-block", className)} style={style} />;
}

export function HoursKpiChart({
  buckets,
  summary,
  emptyHint,
  planHint,
  caption,
}: {
  buckets: HoursKpiBucket[];
  summary: HoursKpiSummary;
  emptyHint?: ReactNode;
  planHint?: ReactNode;
  caption: string;
}) {
  const maxValue = Math.max(
    0,
    ...buckets.map((bucket) => bucket.total),
    ...buckets.map((bucket) => bucket.totalTarget ?? 0),
    ...buckets.map((bucket) => bucket.billableTarget ?? 0),
  );
  const { top, ticks } = niceScale(maxValue);
  const hasHours = buckets.some((bucket) => bucket.total > 0);
  const hasTotalTarget = buckets.some((bucket) => (bucket.totalTarget ?? 0) > 0);
  const hasBillableTarget = buckets.some((bucket) => (bucket.billableTarget ?? 0) > 0);
  const half = Math.ceil(buckets.length / 2);

  return (
    <div className="@container grid min-w-0 gap-4" data-kpi-chart>
      <div className="grid gap-1">
        <SummaryRow
          label={summary.label}
          value={summary.total}
          target={summary.totalTarget}
          kind="total"
        />
        <SummaryRow
          label="Fakturovatelné"
          value={summary.billable}
          target={summary.billableTarget}
          kind="billable"
        />
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#566673]" aria-label="Legenda">
        <li className="inline-flex items-center gap-1.5">
          <LegendSwatch className="h-2.5 w-2.5 rounded-sm" style={{ background: BILLABLE_COLOR }} />
          Fakturovatelné
        </li>
        <li className="inline-flex items-center gap-1.5">
          <LegendSwatch
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: NON_BILLABLE_COLOR }}
          />
          Nefakturovatelné
        </li>
        {hasTotalTarget ? (
          <li className="inline-flex items-center gap-1.5">
            <LegendSwatch
              className="w-4 border-t-2 border-dashed"
              style={{ borderColor: TARGET_TOTAL_COLOR }}
            />
            Cíl celkem
          </li>
        ) : null}
        {hasBillableTarget ? (
          <li className="inline-flex items-center gap-1.5">
            <LegendSwatch
              className="w-4 border-t-2 border-dotted"
              style={{ borderColor: TARGET_BILLABLE_COLOR }}
            />
            Cíl fakturovatelných
          </li>
        ) : null}
      </ul>

      <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
        {/* Osa Y */}
        <div className="relative h-40 text-right text-[11px] tabular-nums text-[#566673]" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2 leading-none"
              style={{ bottom: `${pctOf(tick, top)}%` }}
            >
              {formatHours(tick)}
            </span>
          ))}
        </div>
        {/* Plot */}
        <div className="relative h-40 min-w-0" data-kpi-plot>
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 border-t",
                tick === 0 ? "border-[#94a3ad]" : "border-[#eef2f4]",
              )}
              style={{ bottom: `${pctOf(tick, top)}%` }}
            />
          ))}
          <div
            className="absolute inset-0 grid grid-flow-col auto-cols-fr gap-1 @md:gap-2"
            role="group"
            aria-label={caption}
          >
            {buckets.map((bucket, index) => {
              const billablePct = visiblePct(bucket.billable, top);
              const nonBillable = Math.max(0, bucket.total - bucket.billable);
              const nonBillablePct = visiblePct(nonBillable, top);
              const gap = billablePct > 0 && nonBillablePct > 0 ? "2px" : "0px";
              const stackTop = billablePct + nonBillablePct;
              const label = bucketAriaLabel(bucket);
              return (
                <div
                  key={bucket.key}
                  role="img"
                  className="group relative h-full min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#0e1822]/40"
                  tabIndex={0}
                  aria-label={label}
                  data-kpi-bucket={bucket.key}
                  data-kpi-current={bucket.current ? "true" : undefined}
                >
                  {bucket.current ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-sm bg-[#17A2A2]/8"
                    />
                  ) : null}
                  <div className="absolute inset-x-0 bottom-0 top-0 mx-auto w-full max-w-6">
                    {billablePct > 0 ? (
                      <div
                        data-kpi="bar-billable"
                        className={cn(
                          "absolute inset-x-0 bottom-0",
                          nonBillablePct > 0 ? "" : "rounded-t-[4px]",
                        )}
                        style={{ height: `${billablePct}%`, background: BILLABLE_COLOR }}
                      />
                    ) : null}
                    {nonBillablePct > 0 ? (
                      <div
                        data-kpi="bar-nonbillable"
                        className="absolute inset-x-0 rounded-t-[4px]"
                        style={{
                          bottom: `calc(${billablePct}% + ${gap})`,
                          height: `${nonBillablePct}%`,
                          background: NON_BILLABLE_COLOR,
                        }}
                      />
                    ) : null}
                  </div>
                  {bucket.total > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 z-[1] mx-auto w-fit rounded-sm bg-white/90 px-0.5 text-center text-[11px] font-medium leading-none text-[#0e1822] tabular-nums"
                      style={{ bottom: `calc(${Math.min(stackTop, 92)}% + 6px)` }}
                    >
                      {formatHours(bucket.total)}
                    </span>
                  ) : null}
                  {bucket.totalTarget != null && bucket.totalTarget > 0 ? (
                    <div
                      aria-hidden="true"
                      data-kpi="target-total"
                      className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed"
                      style={{
                        bottom: `${pctOf(bucket.totalTarget, top)}%`,
                        borderColor: TARGET_TOTAL_COLOR,
                        boxShadow: "0 -1px 0 0 #fff, 0 1px 0 0 #fff",
                      }}
                    />
                  ) : null}
                  {bucket.billableTarget != null && bucket.billableTarget > 0 ? (
                    <div
                      aria-hidden="true"
                      data-kpi="target-billable"
                      className="pointer-events-none absolute inset-x-0 border-t-2 border-dotted"
                      style={{
                        bottom: `${pctOf(bucket.billableTarget, top)}%`,
                        borderColor: TARGET_BILLABLE_COLOR,
                        boxShadow: "0 -1px 0 0 #fff, 0 1px 0 0 #fff",
                      }}
                    />
                  ) : null}
                  {/* Tooltip (hover i fokus klávesnicí) */}
                  <div
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max max-w-[13rem] rounded-md border border-[#dce4e8] bg-white px-2.5 py-2 text-xs text-[#0e1822] shadow-md group-hover:block group-focus-visible:block",
                      index < half ? "left-0" : "right-0",
                    )}
                  >
                    <p className="font-semibold">{bucket.label}</p>
                    <p>Celkem {formatHours(bucket.total)} h</p>
                    <p>Fakturovatelné {formatHours(bucket.billable)} h</p>
                    <p>Nefakturovatelné {formatHours(nonBillable)} h</p>
                    {bucket.totalTarget != null && bucket.totalTarget > 0 ? (
                      <p className="text-[#566673]">
                        Cíl {formatHours(bucket.totalTarget)} h
                        {bucket.billableTarget != null && bucket.billableTarget > 0
                          ? ` · fakturovatelné ${formatHours(bucket.billableTarget)} h`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Osa X */}
        <div aria-hidden="true" />
        <div
          className="mt-1.5 grid grid-flow-col auto-cols-fr gap-1 text-center text-[11px] leading-tight text-[#566673] @md:gap-2"
          aria-hidden="true"
        >
          {buckets.map((bucket) => (
            <span
              key={bucket.key}
              className={cn(
                "min-w-0 truncate",
                bucket.current && "font-semibold text-[#0e1822]",
              )}
            >
              <span className="@lg:hidden">{bucket.shortLabel}</span>
              <span className="hidden @lg:inline">{bucket.label}</span>
            </span>
          ))}
        </div>
      </div>

      {!hasHours && emptyHint ? (
        <div className="text-sm text-[#566673]">{emptyHint}</div>
      ) : null}
      {!hasTotalTarget && !hasBillableTarget && planHint ? (
        <div className="text-sm text-[#566673]">{planHint}</div>
      ) : null}

      {/* sr-only na obalu: tabulka sama by se roztáhla na šířku obsahu. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Období</th>
              <th scope="col">Celkem (h)</th>
              <th scope="col">Fakturovatelné (h)</th>
              <th scope="col">Nefakturovatelné (h)</th>
              <th scope="col">Cíl celkem (h)</th>
              <th scope="col">Cíl fakturovatelných (h)</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.key}>
                <th scope="row">{bucket.label}</th>
                <td>{formatHours(bucket.total)}</td>
                <td>{formatHours(bucket.billable)}</td>
                <td>{formatHours(Math.max(0, bucket.total - bucket.billable))}</td>
                <td>{bucket.totalTarget != null ? formatHours(bucket.totalTarget) : "—"}</td>
                <td>
                  {bucket.billableTarget != null ? formatHours(bucket.billableTarget) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
