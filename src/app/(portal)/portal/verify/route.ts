import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ModuleKey, PortalAccessStatus } from "@/generated/prisma/enums";
import { auditJson } from "@/lib/audit";
import { isModuleEnabled } from "@/lib/entitlements";
import {
  PORTAL_SESSION_COOKIE,
  signPortalSession,
} from "@/lib/portal/portal-session";
import {
  hashPortalToken,
  PORTAL_SESSION_TTL_SECONDS,
} from "@/lib/portal/portal-token";
import { getPrisma } from "@/lib/prisma";

// Verifies a magic-link token (single-use), issues a DB-tracked client session,
// sets the portal cookie, and redirects into the portal. Any failure is a generic
// redirect to login — never reveals whether a token existed.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    redirect("/portal/login?error=1");
  }

  const prisma = getPrisma();
  const tokenHash = hashPortalToken(token);

  let sessionId: string | null = null;

  try {
    sessionId = await prisma.$transaction(async (tx) => {
      // Lock the token row so a token can't be consumed twice concurrently.
      await tx.$queryRaw`SELECT id FROM "portalLoginTokens" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;

      const row = await tx.portalLoginToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          consumedAt: true,
          expiresAt: true,
          portalAccessId: true,
          organizationId: true,
          portalAccess: { select: { status: true } },
        },
      });

      if (
        !row ||
        row.consumedAt !== null ||
        row.expiresAt <= new Date() ||
        row.portalAccess.status !== PortalAccessStatus.ACTIVE
      ) {
        return null;
      }

      const enabled = await isModuleEnabled(
        row.organizationId,
        ModuleKey.CLIENT_PORTAL,
      );
      if (!enabled) {
        return null;
      }

      await tx.portalLoginToken.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      });

      const session = await tx.portalSession.create({
        data: {
          portalAccessId: row.portalAccessId,
          organizationId: row.organizationId,
          expiresAt: new Date(Date.now() + PORTAL_SESSION_TTL_SECONDS * 1000),
        },
        select: { id: true },
      });

      await tx.portalAccess.update({
        where: { id: row.portalAccessId },
        data: { lastLoginAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          entityType: "PortalAccess",
          entityId: row.portalAccessId,
          action: "PORTAL_LOGIN",
          changedById: null,
          newValue: auditJson({ sessionId: session.id }),
        },
      });

      return session.id;
    });
  } catch {
    sessionId = null;
  }

  if (!sessionId) {
    redirect("/portal/login?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    PORTAL_SESSION_COOKIE,
    signPortalSession(sessionId, PORTAL_SESSION_TTL_SECONDS),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/portal",
      maxAge: PORTAL_SESSION_TTL_SECONDS,
    },
  );

  redirect("/portal");
}
