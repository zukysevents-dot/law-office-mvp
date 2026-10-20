"use server";

import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import {
  clearAccountLoginFailures,
  hashLoginIdentifier,
  reservePasswordSetupAttempt,
} from "@/lib/login-rate-limit";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { getRequestIp } from "@/lib/portal/portal-rate-limit";
import { getPrisma } from "@/lib/prisma";
import { INVALID_INVITATION_MESSAGE } from "@/lib/user-invitation-messages";
import { findUsableInvitation } from "@/lib/user-invitations";

export type SetPasswordState = {
  error?: string;
  /** The link itself is no longer usable — the page hides the form. */
  invalid?: boolean;
  submittedAt?: number;
};

class InvitationConsumedError extends Error {}

// Public action behind /set-password?token=… (the welcome invitation link).
// Rate-limited per link and per IP, single use (race-safe), and it bumps the
// user's sessionVersion so any older session is signed out.
export async function setPasswordWithInvitation(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const token = formData.get("token");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("passwordConfirm") ?? "");
  const submittedAt = Date.now();

  const invitation = await findUsableInvitation(token);
  if (!invitation) {
    return { invalid: true, error: INVALID_INVITATION_MESSAGE, submittedAt };
  }

  // Same fail-open policy as staff login: a ledger outage must not lock out
  // legitimate users; the single-use token check below still fails closed.
  let allowed = true;
  try {
    allowed = await reservePasswordSetupAttempt(
      await getRequestIp(),
      invitation.tokenHash,
    );
  } catch (error) {
    console.error("password-setup rate-limit check failed", error);
  }
  if (!allowed) {
    return {
      error: "Příliš mnoho pokusů. Zkuste to prosím za 15 minut.",
      submittedAt,
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`,
      submittedAt,
    };
  }
  if (password !== confirm) {
    return { error: "Hesla se neshodují.", submittedAt };
  }

  const passwordHash = await hashPassword(password);
  const prisma = getPrisma();
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // Single use: only the request that flips usedAt wins.
      const consumed = await tx.userInvitationToken.updateMany({
        where: {
          id: invitation.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw new InvitationConsumedError();
      }

      const user = await tx.user.findUnique({
        where: { id: invitation.userId },
        select: { active: true, emailVerifiedAt: true },
      });
      if (!user?.active) {
        throw new InvitationConsumedError();
      }

      await tx.user.update({
        where: { id: invitation.userId },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
          emailVerifiedAt: user.emailVerifiedAt ?? now,
        },
      });

      // Any other open link of this user is now pointless.
      await tx.userInvitationToken.updateMany({
        where: {
          userId: invitation.userId,
          id: { not: invitation.id },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    });
  } catch (error) {
    if (error instanceof InvitationConsumedError) {
      return { invalid: true, error: INVALID_INVITATION_MESSAGE, submittedAt };
    }
    throw error;
  }

  // A fresh password owned by the user: earlier failed logins (e.g. guessing
  // before the invitation arrived) must not keep the account throttled.
  try {
    await clearAccountLoginFailures(hashLoginIdentifier(invitation.user.email));
  } catch (error) {
    console.error("login failures could not be cleared after password setup", error);
  }

  if (invitation.organizationId) {
    await writeAuditLog({
      organizationId: invitation.organizationId,
      entityType: "User",
      entityId: invitation.userId,
      action: "PASSWORD_SET_VIA_INVITATION",
      changedById: invitation.userId,
      newValue: { tokenId: invitation.id },
    });
  }

  redirect("/login?passwordSet=1");
}
