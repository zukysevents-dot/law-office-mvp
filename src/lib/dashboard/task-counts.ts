import { TaskStatus } from "@/generated/prisma/enums";

// Shape returned by `prisma.task.groupBy({ by: ["status"], _count: { _all: true } })`.
export type TaskStatusGroup = {
  status: TaskStatus;
  _count: { _all: number };
};

// Count for a single status, 0 when that status is absent from the groups
// (Prisma omits zero-count groups). Pure — reused by the dashboard and the
// tasks list, which both replaced separate COUNT queries with one groupBy.
export function statusCount(
  groups: TaskStatusGroup[],
  status: TaskStatus,
): number {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}

// "Active" = every non-completed status. Mirrors the old
// `count({ status: { not: COMPLETED } })` exactly.
export function activeTaskCount(groups: TaskStatusGroup[]): number {
  return groups
    .filter((group) => group.status !== TaskStatus.COMPLETED)
    .reduce((sum, group) => sum + group._count._all, 0);
}
