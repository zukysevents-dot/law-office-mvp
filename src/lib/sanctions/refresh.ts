// Refresh orchestration: pull the EU list, upsert into the local mirror, and
// tombstone entries that have left the list. Idempotent (upsert by source id).
// On a source outage it returns an error WITHOUT touching the existing copy.

import { writeAuditLog } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { SANCTIONS_SOURCE } from "@/lib/sanctions/config";
import { fetchEuSanctionsList } from "@/lib/sanctions/source-eu";

export type SanctionsRefreshResult =
  | { status: "ok"; total: number; removed: number }
  | { status: "error"; message: string };

export async function refreshSanctionsList(): Promise<SanctionsRefreshResult> {
  const fetched = await fetchEuSanctionsList();
  if (fetched.status === "error") {
    // Never wipe the existing mirror when the source is unreachable.
    return { status: "error", message: fetched.message };
  }

  const prisma = getPrisma();
  const seenIds: string[] = [];

  for (const entry of fetched.entries) {
    await prisma.sanctionsListEntry.upsert({
      where: {
        source_sourceEntityId: {
          source: entry.source,
          sourceEntityId: entry.sourceEntityId,
        },
      },
      create: {
        source: entry.source,
        sourceEntityId: entry.sourceEntityId,
        entityType: entry.entityType,
        primaryName: entry.primaryName,
        normalizedName: entry.normalizedName,
        aliasesNormalized: entry.aliasesNormalized,
        countries: entry.countries,
        programs: entry.programs,
      },
      update: {
        entityType: entry.entityType,
        primaryName: entry.primaryName,
        normalizedName: entry.normalizedName,
        aliasesNormalized: entry.aliasesNormalized,
        countries: entry.countries,
        programs: entry.programs,
      },
    });
    seenIds.push(entry.sourceEntityId);
  }

  const removed = await prisma.sanctionsListEntry.deleteMany({
    where: { source: SANCTIONS_SOURCE, sourceEntityId: { notIn: seenIds } },
  });

  await writeAuditLog({
    entityType: "SanctionsList",
    entityId: SANCTIONS_SOURCE,
    action: "SANCTIONS_LIST_REFRESH",
    newValue: { total: fetched.entries.length, removed: removed.count },
  });

  return { status: "ok", total: fetched.entries.length, removed: removed.count };
}
