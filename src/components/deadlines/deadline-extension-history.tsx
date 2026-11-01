import type { Prisma } from "@/generated/prisma/client";
import { deadlineExtensionSummary } from "@/lib/deadline-extension";
import { formatDateTime, formatDateUtc } from "@/lib/format";

/** Prisma select for the history shown at a deadline (newest first). */
export const deadlineExtensionsSelect = {
  orderBy: { createdAt: "desc" },
  take: 50,
  select: {
    id: true,
    previousDueDate: true,
    newDueDate: true,
    reason: true,
    createdAt: true,
    extendedBy: { select: { name: true } },
  },
} satisfies Prisma.Deadline$extensionsArgs;

export type DeadlineExtensionRow = {
  id: string;
  previousDueDate: Date;
  newDueDate: Date;
  reason: string;
  createdAt: Date;
  extendedBy: { name: string } | null;
};

// „Prodlouženo 2× · původně 10. 11. 2026" + rozbalitelná historie (kdo, kdy,
// z jakého na jaký termín, důvod). Nic, pokud lhůta prodloužená nebyla.
export function DeadlineExtensionHistory({
  extensions,
}: {
  extensions: DeadlineExtensionRow[];
}) {
  const summary = deadlineExtensionSummary(extensions);
  if (summary.count === 0) {
    return null;
  }

  return (
    <details className="mt-1 text-xs text-[#566673]" data-testid="deadline-extensions">
      <summary className="cursor-pointer select-none font-medium text-amber-900">
        Prodlouženo {summary.count}× · původně {formatDateUtc(summary.originalDueDate)}
      </summary>
      <ol className="mt-1 grid max-w-sm gap-1.5 border-l-2 border-amber-200 pl-3">
        {extensions.map((extension) => (
          <li key={extension.id} className="whitespace-normal">
            <span className="font-medium text-[#0e1822]">
              {formatDateUtc(extension.previousDueDate)} → {formatDateUtc(extension.newDueDate)}
            </span>
            <span className="block">
              {formatDateTime(extension.createdAt)}
              {extension.extendedBy ? ` · ${extension.extendedBy.name}` : ""}
            </span>
            <span className="block whitespace-pre-line break-words text-[#2c3a45]">
              {extension.reason}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
