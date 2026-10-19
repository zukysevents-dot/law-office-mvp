import {
  OrganizationMemberStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_HOURS,
  invitationExpiry,
  isInvitationUsable,
  isWellFormedInvitationToken,
  isWithinInvitationResendDedupe,
  setPasswordUrl,
} from "@/lib/invitation-token";
import { userRoleLabels } from "@/lib/labels";
import { appUrl, mailConfigStatus, sendMail } from "@/lib/mail/mailer";
import {
  buildMemberJoinedEmail,
  buildUserInvitationEmail,
} from "@/lib/mail/templates";
import { getPrisma } from "@/lib/prisma";
import type { InvitationResult } from "@/lib/user-invitation-messages";

export type { InvitationResult } from "@/lib/user-invitation-messages";

type Actor = { id: string; name: string };

/**
 * Issues a fresh one-time "set your own password" link for a member of
 * `organizationId` and e-mails the welcome invitation right away (not via the
 * hourly notification cron). Older unused links of that user are revoked
 * only once the new one was actually sent; an undelivered link is revoked.
 * Never throws for mail problems — the result says SENT / DISABLED (SMTP not
 * configured) / FAILED, so the admin can be told to hand over credentials.
 * Every outcome is audit-logged.
 */
export async function issueAndSendUserInvitation({
  userId,
  organizationId,
  actor,
  dedupe = false,
}: {
  userId: string;
  organizationId: string;
  actor: Actor;
  /** Refuse when the previous invitation is younger than 60 s (resend button). */
  dedupe?: boolean;
}): Promise<InvitationResult> {
  const prisma = getPrisma();
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: {
      status: true,
      organization: { select: { name: true } },
      user: { select: { id: true, name: true, email: true, active: true } },
    },
  });

  if (!membership) {
    return { status: "NOT_FOUND" };
  }

  const { user, organization } = membership;

  if (!user.active || membership.status !== OrganizationMemberStatus.ACTIVE) {
    return { status: "INACTIVE" };
  }

  if (dedupe) {
    // Anti-spam: only an e-mail that actually went out blocks a resend for a
    // minute. A not-sent attempt (SMTP off / failed) may be retried at once.
    const lastSent = await prisma.userInvitationToken.findFirst({
      where: { userId, sentAt: { not: null } },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });
    if (isWithinInvitationResendDedupe(lastSent?.sentAt)) {
      return { status: "DEDUPED" };
    }
  }

  const token = generateInvitationToken();
  const now = new Date();
  const expiresAt = invitationExpiry(now);

  // Older links stay valid until the new one has actually been delivered —
  // a resend while SMTP is off or failing must not kill a link the user
  // already has in the inbox.
  const tokenRow = await prisma.userInvitationToken.create({
    data: {
      userId,
      organizationId,
      createdById: actor.id,
      tokenHash: hashInvitationToken(token),
      expiresAt,
    },
    select: { id: true },
  });

  const content = buildUserInvitationEmail({
    userName: user.name,
    email: user.email,
    organizationName: organization.name,
    createdByName: actor.name,
    loginUrl: appUrl("/login"),
    setPasswordUrl: setPasswordUrl(token),
    ttlHours: INVITATION_TTL_HOURS,
  });
  const sent = await sendMail({ to: user.email, ...content });

  if (sent.status === "SENT") {
    await prisma.$transaction([
      prisma.userInvitationToken.update({
        where: { id: tokenRow.id },
        data: { sentAt: new Date() },
      }),
      // The new link is in the inbox now → older unused links are superseded.
      prisma.userInvitationToken.updateMany({
        where: {
          userId,
          id: { not: tokenRow.id },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      }),
    ]);
    await writeAuditLog({
      organizationId,
      entityType: "User",
      entityId: userId,
      action: "INVITATION_SENT",
      changedById: actor.id,
      newValue: {
        email: user.email,
        tokenId: tokenRow.id,
        expiresAt: expiresAt.toISOString(),
      },
    });
    return { status: "SENT", expiresAt };
  }

  // Never delivered → the link must not be usable. The row stays as the
  // record of the attempt (column "Pozvánka" → "Neodesláno").
  await prisma.userInvitationToken.update({
    where: { id: tokenRow.id },
    data: { revokedAt: new Date() },
  });

  await writeAuditLog({
    organizationId,
    entityType: "User",
    entityId: userId,
    action: "INVITATION_NOT_SENT",
    changedById: actor.id,
    newValue: {
      email: user.email,
      status: sent.status,
      reason: sent.status === "DISABLED" ? sent.reason : sent.error,
    },
  });

  if (sent.status === "DISABLED") {
    return { status: "DISABLED", reason: sent.reason };
  }
  console.error("user invitation e-mail failed", sent.error);
  return { status: "FAILED", error: sent.error };
}

/**
 * Best-effort e-mail to the office's active ADMIN/PARTNER members (who haven't
 * switched e-mails off) when someone joins via a registration code. Never
 * throws and never blocks the join.
 */
export async function notifyOrgAdminsAboutNewMember({
  organizationId,
  userId,
  joinCodeLabel,
}: {
  organizationId: string;
  userId: string;
  joinCodeLabel?: string | null;
}): Promise<void> {
  try {
    const prisma = getPrisma();
    const [organization, member, admins] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, role: true },
      }),
      prisma.organizationMember.findMany({
        where: {
          organizationId,
          status: OrganizationMemberStatus.ACTIVE,
          role: { in: [UserRole.ADMIN, UserRole.PARTNER] },
          userId: { not: userId },
          user: { active: true },
        },
        select: {
          user: {
            select: {
              email: true,
              notificationPreference: { select: { emailEnabled: true } },
            },
          },
        },
      }),
    ]);
    if (!organization || !member) {
      return;
    }

    const recipients = admins
      .filter((admin) => admin.user.notificationPreference?.emailEnabled !== false)
      .map((admin) => admin.user.email);

    const content = buildMemberJoinedEmail({
      memberName: member.name,
      memberEmail: member.email,
      organizationName: organization.name,
      joinCodeLabel,
      roleLabel: userRoleLabels[member.role],
      settingsUrl: appUrl("/settings/organization"),
    });

    let sentCount = 0;
    let failedCount = 0;
    let reason: string | undefined;
    const config = mailConfigStatus();
    if (!config.enabled) {
      // SMTP off → no point trying any recipient.
      failedCount = recipients.length;
      reason = config.reason;
    } else {
      // In parallel: with a dead SMTP host every attempt waits for the
      // timeouts, and the joining user must not wait that long per admin.
      const results = await Promise.all(
        recipients.map((to) => sendMail({ to, ...content })),
      );
      for (const result of results) {
        if (result.status === "SENT") {
          sentCount += 1;
        } else {
          failedCount += 1;
          reason = result.status === "DISABLED" ? result.reason : result.error;
        }
      }
    }

    await writeAuditLog({
      organizationId,
      entityType: "OrganizationMember",
      entityId: userId,
      action: "JOIN_NOTIFICATION",
      changedById: userId,
      newValue: {
        recipients: recipients.length,
        sent: sentCount,
        failed: failedCount,
        ...(reason ? { reason } : {}),
      },
    });
  } catch (error) {
    console.error("join notification failed", error);
  }
}

/**
 * Resolves a plaintext link token to a still-usable invitation (not expired,
 * used or revoked; user active). Returns null otherwise — the caller shows one
 * generic "invalid or expired" message so nothing about the reason leaks.
 */
export async function findUsableInvitation(token: unknown) {
  if (!isWellFormedInvitationToken(token)) {
    return null;
  }
  const row = await getPrisma().userInvitationToken.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      tokenHash: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      user: { select: { email: true, active: true } },
    },
  });
  if (!row || !row.user.active || !isInvitationUsable(row)) {
    return null;
  }
  return row;
}
