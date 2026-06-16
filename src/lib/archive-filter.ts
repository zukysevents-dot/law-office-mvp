export type ArchiveFilter = "active" | "archived" | "all";

export const archiveFilterLabels: Record<ArchiveFilter, string> = {
  active: "Aktivní",
  archived: "Archivované",
  all: "Vše",
};

export function archiveFilterValue(value: string | undefined): ArchiveFilter {
  return value === "archived" || value === "all" ? value : "active";
}

export function archivedWhere(filter: ArchiveFilter) {
  if (filter === "archived") {
    return { archivedAt: { not: null } };
  }

  if (filter === "all") {
    return {};
  }

  return { archivedAt: null };
}
