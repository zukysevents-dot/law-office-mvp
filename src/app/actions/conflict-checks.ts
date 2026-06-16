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
    ? await prisma.subject.findUnique({
        where: { id: subjectId },
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
      searchedQuery,
      subjectId: subject?.id ?? null,
      checkedById: currentUser.id,
      createdAt: { gte: duplicateWindowStart },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingCheck) {
    revalidatePath("/conflict-check");
    revalidatePath("/");

    return {
      saved: true,
      message: "Conflict check uložen",
    };
  }

  await prisma.conflictCheck.create({
    data: {
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
  revalidatePath("/");

  return {
    saved: true,
    message: "Conflict check uložen",
  };
}
