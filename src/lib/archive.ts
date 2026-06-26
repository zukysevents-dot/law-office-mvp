import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { assertCanArchiveRecords, assertSameOrg } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Shared soft-delete for legal records. Every archive*/restore* action was the
// same block — role gate, load, same-org check, flip `archivedAt`, audit — and
// differed only in the model and the audit `entityType`. The caller passes typed
// Prisma ops and revalidates the returned record itself (so e.g. a Case keeps its
// typed `projectId`); `T` is inferred straight from the ops.
export async function setArchived<T extends { id: string; organizationId: string }>(
  formData: FormData,
  entityType: string,
  archived: boolean,
  ops: {
    find: (id: string) => Promise<T>;
    update: (id: string, data: { archivedAt: Date | null }) => Promise<T>;
  },
): Promise<T> {
  const currentUser = await getCurrentUser();
  assertCanArchiveRecords(currentUser);
  const id = requiredString(formData, "id");
  const old = await ops.find(id);
  assertSameOrg(currentUser, old);
  const updated = await ops.update(id, { archivedAt: archived ? new Date() : null });

  await getPrisma().auditLog.create({
    data: {
      entityType,
      entityId: updated.id,
      action: archived ? "ARCHIVE" : "RESTORE",
      changedById: currentUser.id,
      oldValue: auditJson(old),
      newValue: auditJson(updated),
    },
  });

  return updated;
}
