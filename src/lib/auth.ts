import { cache } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  OrganizationMemberStatus,
  OrganizationStatus,
} from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Resolves the signed-in account from the session cookie, WITHOUT requiring an
// organization membership. Used by routes that exist before a user has joined a
// firm (/register, /join-organization) and by the platform-admin panel.
// Wrapped in React cache() so the cookie read + user lookup runs at most once
// per request even though many helpers call it.
export const getAuthUser = cache(async function getAuthUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = await verifySession(token);

  if (userId) {
    const user = await getPrisma().user.findFirst({
      where: { id: userId, active: true },
    });
    if (user) {
      return user;
    }
  }

  redirect("/login");
});

// Resolves the signed-in user AND their active organization. This is the gate
// for all (app) routes: a logged-in account with no active membership is sent to
// /join-organization (or /admin for platform admins). The returned object adds
// `organizationId` and overrides `role` with the org-scoped role, so every
// downstream permission/visibility helper is automatically org-aware.
// Wrapped in React cache() so the membership lookup is deduplicated per request.
export const getCurrentUser = cache(async function getCurrentUser() {
  const user = await getAuthUser();
  const prisma = getPrisma();

  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: user.id,
      status: OrganizationMemberStatus.ACTIVE,
      organization: { is: { status: OrganizationStatus.ACTIVE } },
    },
    select: { organizationId: true, role: true },
  });

  if (membership) {
    return { ...user, role: membership.role, organizationId: membership.organizationId };
  }

  // No active org: platform admins manage orgs from /admin, everyone else joins.
  redirect(user.isPlatformAdmin ? "/admin" : "/join-organization");
});
