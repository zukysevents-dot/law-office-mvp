import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";

type AuditInput = {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  changedById?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
};

export function auditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function auditCreateData(
  input: AuditInput,
): Prisma.AuditLogUncheckedCreateInput {
  return {
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    changedById: input.changedById ?? null,
    oldValue: input.oldValue ?? undefined,
    newValue: input.newValue ?? undefined,
  };
}

export async function writeAuditLog(input: AuditInput) {
  const prisma = getPrisma();

  await prisma.auditLog.create({
    data: auditCreateData(input),
  });
}
