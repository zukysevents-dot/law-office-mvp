import { UserRole } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  if (user) {
    return user;
  }

  return prisma.user.create({
    data: {
      name: "Interní uživatel",
      email: "internal@example.local",
      role: UserRole.PARTNER,
      active: true,
    },
  });
}
