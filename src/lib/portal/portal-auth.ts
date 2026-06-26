import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ModuleKey } from "@/generated/prisma/enums";
import { isModuleEnabled } from "@/lib/entitlements";
import {
  PORTAL_SESSION_COOKIE,
  verifyPortalSession,
} from "@/lib/portal/portal-session";
import { getPrisma } from "@/lib/prisma";

// The ONE gate for portal data — the external-facing analogue of getCurrentUser,
// but it NEVER touches internal users/sessions. It validates the portal cookie,
// loads the (non-revoked, non-expired) PortalSession, and confirms the client's
// org still has the CLIENT_PORTAL module. Everything in (portal) reads data only
// after this and only through the PortalShare whitelist — no *VisibilityWhere,
// no org-scope queries.
export type PortalClient = {
  portalAccessId: string;
  subjectId: string;
  organizationId: string;
  email: string;
};

export async function getPortalClient(): Promise<PortalClient | null> {
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  const sessionId = verifyPortalSession(token);
  if (!sessionId) {
    return null;
  }

  const session = await getPrisma().portalSession.findFirst({
    where: {
      id: sessionId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      portalAccess: { is: { status: "ACTIVE" } },
    },
    select: {
      id: true,
      portalAccess: {
        select: {
          id: true,
          subjectId: true,
          organizationId: true,
          email: true,
        },
      },
    },
  });
  if (!session) {
    return null;
  }

  // Entitlement: the client's org must currently have CLIENT_PORTAL on.
  const enabled = await isModuleEnabled(
    session.portalAccess.organizationId,
    ModuleKey.CLIENT_PORTAL,
  );
  if (!enabled) {
    return null;
  }

  return {
    portalAccessId: session.portalAccess.id,
    subjectId: session.portalAccess.subjectId,
    organizationId: session.portalAccess.organizationId,
    email: session.portalAccess.email,
  };
}

export async function requirePortalClient(): Promise<PortalClient> {
  const client = await getPortalClient();
  if (!client) {
    redirect("/portal/login");
  }
  return client;
}
