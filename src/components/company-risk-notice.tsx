import { AlertTriangle } from "lucide-react";

/**
 * Red banner shown on the subject detail page when the subject is flagged risky
 * (insolvency / liquidation / ceased). Links out to ISIR for manual detail.
 */
export function CompanyRiskNotice({
  riskFlag,
  insolvencyStatus,
  isirUrl,
}: {
  riskFlag: boolean;
  insolvencyStatus?: string | null;
  isirUrl?: string | null;
}) {
  if (!riskFlag) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">Rizikový subjekt</p>
        {insolvencyStatus ? <p className="text-sm">{insolvencyStatus}</p> : null}
        {isirUrl ? (
          <a
            href={isirUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm font-medium underline"
          >
            Ověřit v insolvenčním rejstříku (ISIR)
          </a>
        ) : null}
      </div>
    </div>
  );
}
