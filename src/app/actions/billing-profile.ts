"use server";

import { revalidatePath } from "next/cache";

import { ModuleKey } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/entitlements";
import {
  checkboxValue,
  optionalNumber,
  optionalString,
  requiredString,
} from "@/lib/form";
import { assertCanAdministerOrg } from "@/lib/permissions";
import { getPrisma } from "@/lib/prisma";

// Issuer (law office) billing identity. Org-admin only. vatPayer here is the
// default vatMode for new invoices.
export async function saveBillingProfile(formData: FormData) {
  const prisma = getPrisma();
  const currentUser = await getCurrentUser();
  await assertModuleEnabled(currentUser, ModuleKey.BILLING);
  assertCanAdministerOrg(currentUser, currentUser.organizationId);

  const organizationId = currentUser.organizationId;
  const data = {
    legalName: requiredString(formData, "legalName"),
    ico: optionalString(formData, "ico"),
    dic: optionalString(formData, "dic"),
    address: optionalString(formData, "address"),
    bankAccount: optionalString(formData, "bankAccount"),
    iban: optionalString(formData, "iban"),
    vatPayer: checkboxValue(formData, "vatPayer"),
    defaultDueDays: Math.max(
      0,
      Math.round(optionalNumber(formData, "defaultDueDays") ?? 14),
    ),
    invoiceNote: optionalString(formData, "invoiceNote"),
    invoicePrefix: optionalString(formData, "invoicePrefix") ?? "",
  };

  const previous = await prisma.organizationBillingProfile.findUnique({
    where: { organizationId },
  });

  const saved = await prisma.organizationBillingProfile.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...data },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "OrganizationBillingProfile",
      entityId: saved.id,
      action: previous ? "UPDATE" : "CREATE",
      changedById: currentUser.id,
      oldValue: previous ? auditJson(previous) : undefined,
      newValue: auditJson(saved),
    },
  });

  revalidatePath("/settings/billing");
}
