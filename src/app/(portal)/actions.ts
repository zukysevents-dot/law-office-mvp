"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ModuleKey } from "@/generated/prisma/enums";
import { auditJson, writeAuditLog } from "@/lib/audit";
import { isModuleEnabled } from "@/lib/entitlements";
import { requiredString } from "@/lib/form";
import {
  getRequestIp,
  recordPortalLoginAttempt,
} from "@/lib/portal/portal-rate-limit";
import {
  PORTAL_SESSION_COOKIE,
  verifyPortalSession,
} from "@/lib/portal/portal-session";
import {
  portalLinkUrl,
  sendPortalLinkEmail,
} from "@/lib/portal/portal-mailer";
import {
  generatePortalToken,
  hashPortalToken,
  PORTAL_LINK_TTL_SECONDS,
} from "@/lib/portal/portal-token";
import { getPrisma } from "@/lib/prisma";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

// Request a magic link. The response is ALWAYS the same generic redirect,
// regardless of whether the e-mail/org/module exist — no account enumeration.
export async function requestPortalLink(formData: FormData) {
  const prisma = getPrisma();
  const orgSlug = requiredString(formData, "org");
  const email = requiredString(formData, "email").toLowerCase();

  // Coarse, IP-keyed throttle applied UNIFORMLY before any account lookup, so the
  // anonymous surface — non-existent / REVOKED orgs & e-mails — is rate-limited
  // too, not just resolved ACTIVE accounts (the per-access cap below only kicks in
  // once a match is found, leaving enumeration/spam of unknown accounts free). The
  // ledger is DB-backed so the limit holds across serverless instances. Fail-OPEN
  // on infra error: a DB blip must never turn this endpoint into a 500 (an
  // existence oracle) nor lock every client out of login — when blocked we emit
  // the SAME generic redirect as the happy path, so a throttle is indistinguishable
  // from a delivered link.
  const ip = await getRequestIp();
  let withinIpBudget = true;
  try {
    withinIpBudget = await recordPortalLoginAttempt(ip);
  } catch (error) {
    console.error("portal login rate-limit check failed", error);
  }

  if (withinIpBudget) {
    // All matching/sending happens inside a swallow-all try: the response MUST be
    // byte-identical whether or not the org/e-mail/module exists, and a DB/SMTP
    // failure must NOT surface as a 500 (which would be an account-existence
    // oracle). The generic redirect below runs regardless.
    try {
      const organization = await prisma.organization.findUnique({
        where: { slug: orgSlug },
        select: { id: true },
      });

      if (organization) {
        const access = await prisma.portalAccess.findFirst({
          where: { organizationId: organization.id, email, status: "ACTIVE" },
          select: { id: true, organizationId: true },
        });

        if (
          access &&
          (await isModuleEnabled(access.organizationId, ModuleKey.CLIENT_PORTAL))
        ) {
          // Per-access cap: blunt brute-force/spam targeting a single known
          // client (defense-in-depth alongside the coarse IP limit above).
          const recent = await prisma.portalLoginToken.count({
            where: {
              portalAccessId: access.id,
              createdAt: { gt: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
            },
          });

          if (recent < RATE_LIMIT_MAX) {
            const token = generatePortalToken();
            await prisma.portalLoginToken.create({
              data: {
                portalAccessId: access.id,
                organizationId: access.organizationId,
                tokenHash: hashPortalToken(token),
                requestedIp: ip,
                expiresAt: new Date(Date.now() + PORTAL_LINK_TTL_SECONDS * 1000),
              },
            });
            const delivered = await sendPortalLinkEmail(
              email,
              portalLinkUrl(token),
            );
            await writeAuditLog({
              entityType: "PortalAccess",
              entityId: access.id,
              action: "PORTAL_LINK_REQUESTED",
              changedById: null,
              newValue: auditJson({ delivered }),
            });
          }
        }
      }
    } catch (error) {
      // Swallow — never let an internal failure reveal whether the account exists.
      console.error("requestPortalLink failed", error);
    }
  }

  redirect(`/portal/login?org=${encodeURIComponent(orgSlug)}&sent=1`);
}

// Revoke the current client session (DB row) and clear the cookie.
export async function logoutPortal() {
  const cookieStore = await cookies();
  const sessionId = verifyPortalSession(
    cookieStore.get(PORTAL_SESSION_COOKIE)?.value,
  );

  if (sessionId) {
    await getPrisma().portalSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Delete with the same path the cookie was set on ("/portal"), or it won't be
  // removed in the browser. (DB revocation above is the real authority either way.)
  cookieStore.delete({ name: PORTAL_SESSION_COOKIE, path: "/portal" });
  redirect("/portal/login");
}
