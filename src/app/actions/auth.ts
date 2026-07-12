"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { UserRole } from "@/generated/prisma/enums";
import {
  EMAIL_VERIFICATION_TTL_SECONDS,
  emailVerificationUrl,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
} from "@/lib/email-verification";
import {
  isEmailVerificationDeliveryAvailable,
  sendEmailVerification,
  sendExistingRegistrationNotice,
} from "@/lib/email-verification-mailer";
import { safeInternalRedirectPath } from "@/lib/form";
import {
  clearAccountLoginFailures,
  hashLoginIdentifier,
  reserveLoginAttempt,
} from "@/lib/login-rate-limit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getRequestIp } from "@/lib/portal/portal-rate-limit";
import { getPrisma } from "@/lib/prisma";
import { reserveRegistrationAttempt } from "@/lib/registration-rate-limit";
import { SESSION_COOKIE } from "@/lib/session";
import { setUserSessionCookie } from "@/lib/session-cookie";

function safeRedirectTarget(from: unknown): string {
  return safeInternalRedirectPath(from, "/dashboard");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const target = safeRedirectTarget(formData.get("from"));
  const identifierHash = hashLoginIdentifier(email);
  const ipAddress = await getRequestIp();

  const prisma = getPrisma();
  // DB-backed limiter works across serverless instances. If its ledger is
  // temporarily unavailable we fail open here; the actual credential lookup
  // still fails closed and an outage cannot lock out every legitimate user.
  let withinRateLimit = true;
  try {
    withinRateLimit = (
      await reserveLoginAttempt(ipAddress, identifierHash)
    ).allowed;
  } catch (error) {
    console.error("staff login rate-limit check failed", error);
  }

  const user = withinRateLimit
    ? await prisma.user.findFirst({
        where: { email, active: true, emailVerifiedAt: { not: null } },
      })
    : null;
  // Spusť scrypt i pro neexistující e-mail (konstantní čas, bug #13) — jinak
  // rychlá odpověď prozradí, že účet neexistuje.
  const ok = await verifyPassword(password, user?.passwordHash ?? null);

  if (!user || !ok) {
    const errorCode = withinRateLimit ? "1" : "rate";
    redirect(`/login?error=${errorCode}&from=${encodeURIComponent(target)}`);
  }

  // A correct password clears failures tied to this account. It cannot clear
  // failures for other addresses sharing the same IP/NAT bucket.
  try {
    await clearAccountLoginFailures(identifierHash);
  } catch (error) {
    console.error("staff login failures could not be cleared", error);
  }

  await setUserSessionCookie(user.id, user.sessionVersion);

  redirect(target);
}

// Self-registration stores only a pending verification row. The User (which can
// join a firm) does not exist until the mailbox owner consumes the token. This
// prevents unauthenticated callers from reserving/squatting another person's
// unique e-mail address.
export async function registerAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name) {
    redirect("/register?error=name");
  }
  if (!email || !email.includes("@")) {
    redirect("/register?error=email");
  }
  if (password.length < 8) {
    redirect("/register?error=password");
  }

  const prisma = getPrisma();
  const identifierHash = hashLoginIdentifier(email);
  const ipAddress = await getRequestIp();
  let withinRegistrationRateLimit = false;
  try {
    withinRegistrationRateLimit = await reserveRegistrationAttempt(
      ipAddress,
      identifierHash,
    );
  } catch (error) {
    console.error("registration rate-limit reservation failed", error);
    // Anonymous account creation fails closed in production. Local development
    // may proceed so a transient local ledger issue does not block setup.
    withinRegistrationRateLimit = process.env.NODE_ENV !== "production";
  }
  if (!withinRegistrationRateLimit) {
    redirect("/register?sent=1");
  }

  const passwordHash = await hashPassword(password);

  // Keep local setup ergonomic: without SMTP, non-production behaves like the
  // historical flow. Production always fails closed — no User is materialized
  // when a verification message cannot be delivered.
  if (
    process.env.NODE_ENV !== "production" &&
    !isEmailVerificationDeliveryAvailable()
  ) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      redirect("/register?sent=1");
    }
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        role: UserRole.LAWYER,
      },
    });
    await setUserSessionCookie(user.id, user.sessionVersion);
    redirect("/join-organization");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  // Same outward result for existing and new addresses: do not turn the public
  // registration form into an account-enumeration endpoint.
  if (existing?.emailVerifiedAt) {
    await sendExistingRegistrationNotice(email);
    redirect("/register?sent=1");
  }

  const token = generateEmailVerificationToken();
  const pending = await prisma.emailVerificationToken.create({
    data: {
      name,
      email,
      passwordHash,
      tokenHash: hashEmailVerificationToken(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000),
    },
  });

  const delivered = await sendEmailVerification(
    email,
    emailVerificationUrl(token),
  );
  if (!delivered) {
    // No account exists yet, and remove the undeliverable pending credential so
    // production fails closed without leaving stale password material behind.
    await prisma.emailVerificationToken.deleteMany({
      where: { id: pending.id },
    });
  }

  try {
    await prisma.emailVerificationToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch {
    // non-critical housekeeping
  }

  // Deliberately generic even on SMTP failure or throttling. Revealing delivery
  // success would reveal whether an e-mail is already registered.
  redirect("/register?sent=1");
}

export async function verifyEmailAction(formData: FormData) {
  const rawToken = String(formData.get("token") ?? "");
  if (!rawToken) redirect("/verify-email?error=1");

  const prisma = getPrisma();
  const tokenHash = hashEmailVerificationToken(rawToken);

  const user = await prisma
    .$transaction(async (tx) => {
      // Single-use under concurrency; link preview scanners only render the GET
      // page and cannot consume this token because the mutation is a POST action.
      await tx.$queryRaw`SELECT id FROM "emailVerificationTokens" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
      const pending = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
      });
      if (!pending || pending.expiresAt <= new Date()) return null;

      const existing = await tx.user.findUnique({
        where: { email: pending.email },
      });
      if (existing?.emailVerifiedAt) return null;

      const verifiedAt = new Date();
      const verified = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              name: pending.name,
              passwordHash: pending.passwordHash,
              emailVerifiedAt: verifiedAt,
              active: true,
              sessionVersion: { increment: 1 },
            },
          })
        : await tx.user.create({
            data: {
              name: pending.name,
              email: pending.email,
              passwordHash: pending.passwordHash,
              emailVerifiedAt: verifiedAt,
              role: UserRole.LAWYER,
            },
          });

      await tx.emailVerificationToken.deleteMany({
        where: { email: pending.email },
      });
      return verified;
    })
    .catch((error) => {
      console.error("e-mail verification failed", error);
      return null;
    });

  if (!user) redirect("/verify-email?error=1");
  await setUserSessionCookie(user.id, user.sessionVersion);
  redirect("/join-organization");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
