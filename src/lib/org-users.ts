import { OrganizationMemberStatus } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";

type OrgScopedUser = { organizationId: string | null };

// Shared, org-scoped user lookups. `User` has no `organizationId` column —
// membership lives in `OrganizationMember` — so every "who can I pick" list must
// filter through an ACTIVE membership of the current user's organization.
// Without this scope, dropdowns and directories leak the whole cross-tenant
// user list (see bug report #2/#6).

// Active users of the caller's organization, shaped for a <select> dropdown.
// Returns [] when the caller has no active organization.
export async function getOrgUserOptions(
  currentUser: OrgScopedUser,
): Promise<Array<{ id: string; name: string }>> {
  if (!currentUser.organizationId) {
    return [];
  }

  return getPrisma().user.findMany({
    where: {
      active: true,
      memberships: {
        some: {
          organizationId: currentUser.organizationId,
          status: OrganizationMemberStatus.ACTIVE,
        },
      },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

// Guard for user-valued foreign keys taken from FormData (task assignee /
// responsible, password reset target, …). Throws unless `userId` belongs to an
// ACTIVE member of `organizationId`, so a crafted POST can't point at a user
// from another organization. No-op when `userId` is empty (field is optional).
export async function assertUserInOrg(
  userId: string | null | undefined,
  organizationId: string | null,
): Promise<void> {
  if (!userId) {
    return;
  }

  const membership = organizationId
    ? await getPrisma().organizationMember.findFirst({
        where: {
          userId,
          organizationId,
          status: OrganizationMemberStatus.ACTIVE,
        },
        select: { id: true },
      })
    : null;

  if (!membership) {
    throw new Error("Uživatel nepatří do vaší kanceláře.");
  }
}
