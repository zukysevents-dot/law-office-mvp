import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { maskBirthNumber } from "@/lib/subjects/birth-number";

type AuditInput = {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  changedById?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
};

// Sensitive personal data never lands in the audit log (nor its export) in
// full: every `birthNumber` key, at any depth and in any entity, is masked.
function auditReplacer(key: string, value: unknown) {
  if (key === "birthNumber" && typeof value === "string" && value) {
    return maskBirthNumber(value);
  }
  return value;
}

export function auditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value ?? null, auditReplacer),
  ) as Prisma.InputJsonValue;
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
