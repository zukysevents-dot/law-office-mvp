import type { UserRole } from "@/generated/prisma/enums";

export function assertCanArchiveRecords(role: UserRole) {
  void role;
  // Future role check belongs here. For example, allow only PARTNER/ADMIN
  // once the app has real authorization middleware and an ADMIN role.
  return true;
}
