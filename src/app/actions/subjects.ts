"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { setArchived } from "@/lib/archive";
import { auditCreateData, auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { requiredString } from "@/lib/form";
import {
  assertCanEditRecord,
  assertCanManageSubjects,
  canViewRates,
} from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";
import { diffChildRows, rowChanged } from "@/lib/subjects/child-rows";
import type { ContactRow } from "@/lib/subjects/contacts";
import type { StatutoryRow } from "@/lib/subjects/statutory";
import { parseSubjectForm, subjectWriteData } from "@/lib/subjects/subject-input";
import { assertCanAccessModule } from "@/lib/module-access.server";

// The per-org unique IČO violation is an EXPECTED user mistake, not a crash:
// swallow it so the caller can redirect back to the form with an inline notice.
// Only IČO-scoped P2002s are absorbed — any other unique constraint (or
// non-P2002 error) rethrows unchanged.
function nullOnDuplicateIco(error: unknown): null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    // Under the pg driver adapter (Prisma 7) `meta` carries only modelName +
    // driverAdapterError — there is NO `meta.target`, so a column check alone
    // would never match. `@@unique([organizationId, ico])` is Subject's only
    // unique constraint besides the primary key, so any P2002 here IS the IČO
    // collision. meta.target is still honoured when a future driver provides it.
    const target = error.meta?.target;
    const mentionsIco =
      target === undefined ||
      (Array.isArray(target) ? target.includes("ico") : target === "ico");
    if (mentionsIco) {
      return null;
    }
  }
  throw error;
}

const CONTACT_KEYS = ["type", "value", "valueNormalized", "label", "isPrimary", "position"] as const;
const STATUTORY_KEYS = [
  "name",
  "function",
  "actingMethod",
  "validFrom",
  "validTo",
  "linkedSubjectId",
  "position",
] as const;

function contactData(row: Omit<ContactRow, "id">) {
  return {
    type: row.type,
    value: row.value,
    valueNormalized: row.valueNormalized,
    label: row.label,
    isPrimary: row.isPrimary,
    position: row.position,
  };
}

function statutoryData(row: Omit<StatutoryRow, "id">) {
  return {
    name: row.name,
    function: row.function,
    actingMethod: row.actingMethod,
    validFrom: row.validFrom,
    validTo: row.validTo,
    linkedSubjectId: row.linkedSubjectId,
    position: row.position,
  };
}

/**
 * A statutory body may link only to a subject of the SAME office and never to
 * the subject itself. A new link must point to an active subject; a link the
 * subject already has is kept even when the linked subject was archived since
 * (editing anything else must not silently drop it). Anything else (forged id,
 * other tenant) is unlinked — the row's name is kept.
 */
async function sanitizeLinkedSubjects(
  organizationId: string,
  rows: StatutoryRow[],
  selfId: string | null,
  existingLinkedIds: ReadonlyArray<string | null> = [],
): Promise<StatutoryRow[]> {
  const ids = Array.from(
    new Set(rows.map((row) => row.linkedSubjectId).filter((id): id is string => Boolean(id))),
  ).filter((id) => id !== selfId);
  const keep = existingLinkedIds.filter((id): id is string => Boolean(id));
  const allowed = ids.length
    ? new Set(
        (
          await getPrisma().subject.findMany({
            where: {
              id: { in: ids },
              organizationId,
              OR: [{ archivedAt: null }, ...(keep.length ? [{ id: { in: keep } }] : [])],
            },
            select: { id: true },
          })
        ).map((subject) => subject.id),
      )
    : new Set<string>();
  return rows.map((row) =>
    row.linkedSubjectId && allowed.has(row.linkedSubjectId)
      ? row
      : { ...row, linkedSubjectId: null },
  );
}

export async function createSubject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.subjects");
  assertCanManageSubjects(currentUser);
  const organizationId = currentUser.organizationId;

  const parsed = parseSubjectForm(formData);
  if (!parsed.ok) {
    redirect(`/subjects?error=${parsed.error}#new-subject`);
  }
  const statutory = await sanitizeLinkedSubjects(organizationId, parsed.statutory, null);
  // Rates only from users who may see them: a new subject gets none.
  const subjectData = subjectWriteData(parsed.subject, canViewRates(currentUser));

  const subject = await prisma
    .$transaction(async (tx) => {
      const created = await tx.subject.create({
        data: { organizationId, ...subjectData },
      });
      const contacts = parsed.contacts.length
        ? await tx.subjectContact.createManyAndReturn({
            data: parsed.contacts.map((row) => ({
              organizationId,
              subjectId: created.id,
              ...contactData(row),
            })),
          })
        : [];
      const bodies = statutory.length
        ? await tx.subjectStatutoryBody.createManyAndReturn({
            data: statutory.map((row) => ({
              organizationId,
              subjectId: created.id,
              ...statutoryData(row),
            })),
          })
        : [];

      const audit = (entityType: string, entityId: string, value: unknown) =>
        auditCreateData({
          organizationId,
          entityType,
          entityId,
          action: "CREATE",
          changedById: currentUser.id,
          newValue: auditJson(value),
        });
      await tx.auditLog.createMany({
        data: [
          audit("Subject", created.id, created),
          ...contacts.map((row) => audit("SubjectContact", row.id, row)),
          ...bodies.map((row) => audit("SubjectStatutoryBody", row.id, row)),
        ],
      });
      return created;
    })
    .catch(nullOnDuplicateIco);

  if (!subject) {
    redirect("/subjects?error=ico#new-subject");
  }

  revalidatePath("/subjects");
  redirect(`/subjects/${subject.id}`);
}

export async function updateSubject(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertCanAccessModule(currentUser, "module.subjects");
  const subjectId = requiredString(formData, "id");

  const old = await prisma.subject.findUniqueOrThrow({
    where: { id: subjectId },
    include: {
      contacts: { orderBy: { position: "asc" } },
      statutoryBodies: { orderBy: { position: "asc" } },
    },
  });
  assertCanEditRecord(currentUser, "Subject", old);
  const organizationId = old.organizationId;

  const parsed = parseSubjectForm(formData);
  if (!parsed.ok) {
    redirect(`/subjects/${subjectId}/edit?error=${parsed.error}`);
  }
  const statutory = await sanitizeLinkedSubjects(
    organizationId,
    parsed.statutory,
    subjectId,
    old.statutoryBodies.map((body) => body.linkedSubjectId),
  );

  const { contacts: oldContacts, statutoryBodies: oldBodies, ...oldSubject } = old;
  // Rates only from users who may see them: otherwise the stored values stay.
  const subjectData = subjectWriteData(parsed.subject, canViewRates(currentUser));

  const subject = await prisma
    .$transaction(async (tx) => {
      const updated = await tx.subject.update({
        where: { id: subjectId },
        data: subjectData,
      });

      const audits: Prisma.AuditLogCreateManyInput[] = [];
      const audit = (
        entityType: string,
        entityId: string,
        action: string,
        oldValue: unknown,
        newValue: unknown,
      ) =>
        audits.push(
          auditCreateData({
            organizationId,
            entityType,
            entityId,
            action,
            changedById: currentUser.id,
            oldValue: oldValue === null ? null : auditJson(oldValue),
            newValue: newValue === null ? null : auditJson(newValue),
          }),
        );
      audit("Subject", subjectId, "UPDATE", oldSubject, updated);

      // --- contacts ---------------------------------------------------------
      const contactDiff = diffChildRows(oldContacts, parsed.contacts);
      const oldContactById = new Map(oldContacts.map((row) => [row.id, row]));
      if (contactDiff.remove.length) {
        await tx.subjectContact.deleteMany({
          where: { id: { in: contactDiff.remove }, subjectId },
        });
        for (const id of contactDiff.remove) {
          audit("SubjectContact", id, "DELETE", oldContactById.get(id), null);
        }
      }
      for (const row of contactDiff.update) {
        const before = oldContactById.get(row.id)!;
        const data = contactData(row);
        if (!rowChanged(before, data, CONTACT_KEYS)) continue;
        const after = await tx.subjectContact.update({ where: { id: row.id }, data });
        audit("SubjectContact", row.id, "UPDATE", before, after);
      }
      if (contactDiff.create.length) {
        const created = await tx.subjectContact.createManyAndReturn({
          data: contactDiff.create.map((row) => ({
            organizationId,
            subjectId,
            ...contactData(row),
          })),
        });
        for (const row of created) audit("SubjectContact", row.id, "CREATE", null, row);
      }

      // --- statutory bodies -------------------------------------------------
      const bodyDiff = diffChildRows(oldBodies, statutory);
      const oldBodyById = new Map(oldBodies.map((row) => [row.id, row]));
      if (bodyDiff.remove.length) {
        await tx.subjectStatutoryBody.deleteMany({
          where: { id: { in: bodyDiff.remove }, subjectId },
        });
        for (const id of bodyDiff.remove) {
          audit("SubjectStatutoryBody", id, "DELETE", oldBodyById.get(id), null);
        }
      }
      for (const row of bodyDiff.update) {
        const before = oldBodyById.get(row.id)!;
        const data = statutoryData(row);
        if (!rowChanged(before, data, STATUTORY_KEYS)) continue;
        const after = await tx.subjectStatutoryBody.update({ where: { id: row.id }, data });
        audit("SubjectStatutoryBody", row.id, "UPDATE", before, after);
      }
      if (bodyDiff.create.length) {
        const created = await tx.subjectStatutoryBody.createManyAndReturn({
          data: bodyDiff.create.map((row) => ({
            organizationId,
            subjectId,
            ...statutoryData(row),
          })),
        });
        for (const row of created) audit("SubjectStatutoryBody", row.id, "CREATE", null, row);
      }

      await tx.auditLog.createMany({ data: audits });
      return updated;
    })
    .catch(nullOnDuplicateIco);

  if (!subject) {
    redirect(`/subjects/${subjectId}/edit?error=ico`);
  }

  revalidatePath("/subjects");
  revalidatePath(`/subjects/${subject.id}`);
  redirect(`/subjects/${subject.id}`);
}

async function setSubjectArchived(formData: FormData, archived: boolean) {
  const prisma = getPrisma();
  const subject = await setArchived(formData, "Subject", archived, {
    find: (id) => prisma.subject.findUniqueOrThrow({ where: { id } }),
    update: (id, data) => prisma.subject.update({ where: { id }, data }),
  });
  revalidatePath("/subjects");
  revalidatePath(`/subjects/${subject.id}`);
}

export async function archiveSubject(formData: FormData) {
  await setSubjectArchived(formData, true);
}

export async function restoreSubject(formData: FormData) {
  await setSubjectArchived(formData, false);
}
