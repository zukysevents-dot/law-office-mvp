import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import { assertCanAccessModule } from "@/lib/module-access.server";
import type { ModulePermissionKey } from "@/lib/permission-catalog";
import { assertCanArchiveRecords, assertSameOrg } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Shared soft-delete for legal records. Every archive*/restore* action was the
// same block — role gate, load, same-org check, flip `archivedAt`, audit — and
// differed only in the model and the audit `entityType`. The caller passes typed
// Prisma ops and revalidates the returned record itself (so e.g. a Case keeps its
// typed `projectId`); `T` is inferred straight from the ops.
//
// Like create/update, archiving needs access to the record's module: an
// archiver whose section is switched off in the permission matrix cannot
// archive by posting the form directly.
const ARCHIVE_MODULES = {
  Subject: "module.subjects",
  Project: "module.projects",
  Case: "module.cases",
  Task: "module.tasks",
  WorkLog: "module.workLogs",
  Reference: "module.references",
} as const satisfies Record<string, ModulePermissionKey>;

export async function setArchived<T extends { id: string; organizationId: string }>(
  formData: FormData,
  entityType: keyof typeof ARCHIVE_MODULES,
  archived: boolean,
  ops: {
    find: (id: string) => Promise<T>;
    update: (id: string, data: { archivedAt: Date | null }) => Promise<T>;
  },
): Promise<T> {
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, ARCHIVE_MODULES[entityType]);
  assertCanArchiveRecords(currentUser);
  const id = requiredString(formData, "id");
  const old = await ops.find(id);
  assertSameOrg(currentUser, old);
  const updated = await ops.update(id, { archivedAt: archived ? new Date() : null });

  await getPrisma().auditLog.create({
    data: {
      organizationId: currentUser.organizationId,
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
