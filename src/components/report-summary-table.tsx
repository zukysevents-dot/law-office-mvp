import { EmptyState } from "@/components/ui/empty-state";
import { formatHours, formatMoney } from "@/lib/format";
import type { ReportSummaryRow } from "@/lib/reporting/aggregations";

// Shared "label / hodiny / částka / počet" summary table for report views.
export function ReportSummaryTable({
  labelHeader,
  rows,
}: {
  labelHeader: string;
  rows: ReportSummaryRow[];
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
            <th>Částka</th>
            <th>Počet položek</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{formatHours(row.hours)}</td>
              <td>{formatMoney(row.amount)}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
