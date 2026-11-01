import type { Prisma } from "@/generated/prisma/client";

// "Mgr. Jan Novák" → { firstName: "Mgr. Jan", lastName: "Novák" }. Only used
// for auto-created cards; the admin can correct it in HR → Zaměstnanci.
export function splitPersonName(name: string): {
  firstName: string;
  lastName: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] ?? "", lastName: "" };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

// Every active member gets an HR employee card, so attendance, punches and
// absences work without manual HR setup. A user already linked to a card
// (archived included — the admin archived it on purpose) is left alone.
export async function ensureEmployeeCard(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    userId: string;
    name: string;
    createdById: string;
  },
): Promise<void> {
  const existing = await tx.hrEmployee.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  const { firstName, lastName } = splitPersonName(input.name);
  const employee = await tx.hrEmployee.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      firstName,
      lastName,
      createdById: input.createdById,
    },
    select: { id: true },
  });

  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      entityType: "HrEmployee",
      entityId: employee.id,
      action: "CREATE",
      changedById: input.createdById,
      newValue: { firstName, lastName, userId: input.userId, autoCreated: true },
    },
  });
}
