import { EmptyState } from "@/components/ui/empty-state";
import { formatHours, formatMoney } from "@/lib/format";
import type { ReportSummaryRow } from "@/lib/reporting/aggregations";

// Shared "label / hodiny / částka / počet" summary table for report views.
// The amount column renders only for users who may see rates and amounts.
export function ReportSummaryTable({
  labelHeader,
  rows,
  showAmounts,
}: {
  labelHeader: string;
  rows: ReportSummaryRow[];
  showAmounts: boolean;
}) {
  if (rows.length === 0) {
    return <EmptyState>Žádné výkazy práce neodpovídají filtru.</EmptyState>;
  }

  return (
    <div className="table-scroll">
      <table className="w-max min-w-full">
        <thead>
          <tr>
            <th>{labelHeader}</th>
            <th>Hodiny</th>
            {showAmounts ? <th>Částka</th> : null}
            <th>Počet položek</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{formatHours(row.hours)}</td>
              {showAmounts ? <td>{formatMoney(row.amount)}</td> : null}
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
