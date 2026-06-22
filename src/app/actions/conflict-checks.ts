"use server";

import { revalidatePath } from "next/cache";

import { SubjectRole } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { optionalString, requiredString } from "@/lib/form";
import { getPrisma } from "@/lib/prisma";

export type ConflictCheckSaveState = {
  saved: boolean;
  message?: string;
};

export async function saveConflictCheck(
  _previousState: ConflictCheckSaveState,
  formData: FormData,
): Promise<ConflictCheckSaveState> {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  const searchedQuery = requiredString(formData, "searchedQuery");
  const subjectId = optionalString(formData, "subjectId");

  const subject = subjectId
    ? await prisma.subject.findFirst({
        // Org-scoped (tenant isolation), but firm-wide within the org — conflict
        // checks must see counterparties on matters the user can't personally see.
        where: { id: subjectId, organizationId: currentUser.organizationId },
        include: { relations: true },
      })
    : null;

  const hasWarning =
    Boolean(subject?.riskFlag) ||
    Boolean(
      subject?.relations.some((relation) => relation.role === SubjectRole.COUNTERPARTY),
    );

  const resultStatus = subject ? (hasWarning ? "WARNING" : "MATCH") : "NO_MATCH";
  const duplicateWindowStart = new Date(Date.now() - 60_000);
  const existingCheck = await prisma.conflictCheck.findFirst({
    where: {
      organizationId: currentUser.organizationId,
      searchedQuery,
      subjectId: subject?.id ?? null,
      checkedById: currentUser.id,
      createdAt: { gte: duplicateWindowStart },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingCheck) {
    revalidatePath("/conflict-check");
    revalidatePath("/dashboard");

    return {
      saved: true,
      message: "Conflict check uložen",
    };
  }

  await prisma.conflictCheck.create({
    data: {
      organizationId: currentUser.organizationId,
      searchedQuery,
      subjectId: subject?.id ?? null,
      resultStatus,
      checkedById: currentUser.id,
      note: optionalString(formData, "note"),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "ConflictCheck",
      entityId: subject?.id ?? searchedQuery,
      action: "CREATE",
      changedById: currentUser.id,
      newValue: {
        searchedQuery,
        subjectId: subject?.id ?? null,
        resultStatus,
      },
    },
  });

  revalidatePath("/conflict-check");
  revalidatePath("/dashboard");

  return {
    saved: true,
    message: "Conflict check uložen",
  };
}
