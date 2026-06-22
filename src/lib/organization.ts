import type { Prisma } from "@/generated/prisma/client";
import { OrganizationMemberStatus } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";

// Count ACTIVE seats. Pass the transaction client when enforcing the seat limit
// so the count shares the join transaction's locked snapshot (see
// joinOrganization). The full PrismaClient is also assignable here.
export function countActiveMembers(
  client: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  return client.organizationMember.count({
    where: { organizationId, status: OrganizationMemberStatus.ACTIVE },
  });
}

// Everything the org-admin screens render: org, members (with user), join codes,
// and the active-seat count. Shared by /settings/organization and /admin.
export async function getOrganizationAdminData(organizationId: string) {
  const prisma = getPrisma();
  const [organization, members, joinCodes, activeMembers] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.organizationJoinCode.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    }),
    countActiveMembers(prisma, organizationId),
  ]);

  return { organization, members, joinCodes, activeMembers };
}
