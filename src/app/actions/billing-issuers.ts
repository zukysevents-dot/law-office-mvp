"use server";

import { revalidatePath } from "next/cache";

import { ModuleKey } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import { checkboxValue, optionalString, requiredString } from "@/lib/form";
import { assertCanAdministerOrg } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Další fakturující subjekty (kromě hlavního profilu kanceláře). Org-admin only.
export async function createBillingIssuer(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanAdministerOrg(currentUser, currentUser.organizationId);

  const issuer = await prisma.billingIssuer.create({
    data: {
      organizationId: currentUser.organizationId,
      legalName: requiredString(formData, "legalName"),
      ico: optionalString(formData, "ico"),
      dic: optionalString(formData, "dic"),
      address: optionalString(formData, "address"),
      bankAccount: optionalString(formData, "bankAccount"),
      iban: optionalString(formData, "iban"),
      vatPayer: checkboxValue(formData, "vatPayer"),
      note: optionalString(formData, "note"),
    },
  });

  await writeAuditLog({
    entityType: "BillingIssuer",
    entityId: issuer.id,
    action: "CREATE",
    changedById: currentUser.id,
    newValue: { legalName: issuer.legalName, vatPayer: issuer.vatPayer },
  });

  revalidatePath("/settings/billing");
}

export async function archiveBillingIssuer(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanAdministerOrg(currentUser, currentUser.organizationId);

  const id = requiredString(formData, "id");
  const issuer = await prisma.billingIssuer.findFirstOrThrow({
    where: { id, organizationId: currentUser.organizationId },
  });

  await prisma.billingIssuer.update({
    where: { id: issuer.id },
    data: { archivedAt: new Date() },
  });

  await writeAuditLog({
    entityType: "BillingIssuer",
    entityId: issuer.id,
    action: "ARCHIVE",
    changedById: currentUser.id,
  });

  revalidatePath("/settings/billing");
}
