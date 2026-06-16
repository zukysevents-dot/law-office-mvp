import { Archive } from "lucide-react";

import { formatDate } from "@/lib/format";

export function ArchiveNotice({ archivedAt }: { archivedAt: Date | null }) {
  if (!archivedAt) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <Archive className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">Tento záznam je archivovaný.</p>
        <p className="text-sm">Datum archivace: {formatDate(archivedAt)}</p>
      </div>
    </div>
  );
}
