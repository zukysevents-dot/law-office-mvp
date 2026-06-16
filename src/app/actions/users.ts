"use server";

import { revalidatePath } from "next/cache";

import { UserRole } from "@/generated/prisma/enums";
import { checkboxValue, enumValue, optionalString, requiredString } from "@/lib/form";
import { getPrisma } from "@/lib/prisma";

export async function createUser(formData: FormData) {
  const prisma = getPrisma();

  await prisma.user.create({
    data: {
      name: requiredString(formData, "name"),
      email: requiredString(formData, "email"),
      role: enumValue(UserRole, formData.get("role"), UserRole.LAWYER),
      microsoftId: optionalString(formData, "microsoftId"),
      active: checkboxValue(formData, "active"),
    },
  });

  revalidatePath("/settings");
}
