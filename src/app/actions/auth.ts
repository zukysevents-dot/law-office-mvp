"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { UserRole } from "@/generated/prisma/enums";
import { safeInternalRedirectPath } from "@/lib/form";
import {
  clearAccountLoginFailures,
  hashLoginIdentifier,
  reserveLoginAttempt,
} from "@/lib/login-rate-limit";
import { hasAuthHardeningSchema } from "@/lib/auth-hardening-schema";
import {
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "@/lib/password";
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
  const authHardeningSchema = await hasAuthHardeningSchema();
  // DB-backed limiter works across serverless instances. If its ledger is
  // temporarily unavailable we fail open here; the actual credential lookup
  // still fails closed and an outage cannot lock out every legitimate user.
  let withinRateLimit = true;
  if (authHardeningSchema) {
    try {
      withinRateLimit = (
        await reserveLoginAttempt(ipAddress, identifierHash)
      ).allowed;
    } catch (error) {
      console.error("staff login rate-limit check failed", error);
    }
  }

  const user = await (async () => {
    if (!withinRateLimit) return null;

    if (authHardeningSchema) {
      const found = await prisma.user.findFirst({
        where: { email, active: true, emailVerifiedAt: { not: null } },
        select: { id: true, passwordHash: true, sessionVersion: true },
      });
      return found;
    }

    // Compatibility path for a database awaiting the additive hardening
    // migration. Do not select newer columns: Prisma selects every scalar by
    // default, which would make the credential form itself crash.
    const found = await prisma.user.findFirst({
      where: { email, active: true },
      select: { id: true, passwordHash: true },
    });
    return found ? { ...found, sessionVersion: 0 } : null;
  })();
  // Spusť scrypt i pro neexistující e-mail (konstantní čas, bug #13) — jinak
  // rychlá odpověď prozradí, že účet neexistuje.
  const ok = await verifyPassword(password, user?.passwordHash ?? null);

  if (!user || !ok) {
    const errorCode = withinRateLimit ? "1" : "rate";
    redirect(`/login?error=${errorCode}&from=${encodeURIComponent(target)}`);
  }

  // A correct password clears failures tied to this account. It cannot clear
  // failures for other addresses sharing the same IP/NAT bucket.
  if (authHardeningSchema) {
    try {
      await clearAccountLoginFailures(identifierHash);
    } catch (error) {
      console.error("staff login failures could not be cleared", error);
    }
  }

  await setUserSessionCookie(user.id, user.sessionVersion);

  redirect(target);
}

// Self-registration creates the account immediately (no e-mail confirmation)
// and signs the user in; joining a firm still requires a registration code.
export async function registerAction(formData: FormData) {
  // Hard kill-switch, independent of the host-based landing gate (which is
  // presentation-only and fail-open).
  if (process.env.REGISTRATION_ENABLED === "false") {
    redirect("/register?error=disabled");
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name) {
    redirect("/register?error=name");
  }
  if (!email || !email.includes("@")) {
    redirect("/register?error=email");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
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
    redirect("/register?error=rate");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    redirect("/register?error=exists");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user
    .create({
      data: {
        name,
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
        role: UserRole.LAWYER,
      },
      select: { id: true, sessionVersion: true },
    })
    .catch((error) => {
      // Unique violation from a concurrent registration of the same address.
      console.error("registration failed", error);
      return null;
    });
  if (!user) {
    redirect("/register?error=exists");
  }

  await setUserSessionCookie(user.id, user.sessionVersion);
  redirect("/join-organization");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
