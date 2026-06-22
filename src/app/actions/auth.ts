"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { UserRole } from "@/generated/prisma/enums";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getPrisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
} from "@/lib/session";

async function setSessionCookie(userId: string) {
  const token = await signSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

function safeRedirectTarget(from: unknown): string {
  // Only allow internal absolute paths — never an attacker-supplied full URL.
  if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
    return from;
  }
  return "/dashboard";
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const target = safeRedirectTarget(formData.get("from"));

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({ where: { email, active: true } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !ok) {
    redirect(`/login?error=1&from=${encodeURIComponent(target)}`);
  }

  await setSessionCookie(user.id);

  redirect(target);
}

// Self-registration: anyone can create an account with any valid e-mail. The
// firm is joined separately via a registration code (see /join-organization).
// E-mail domain is NOT checked — access is gated by the code + seat limit.
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
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/register?error=exists");
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      // Role is provisional until the user joins an org (which sets it).
      role: UserRole.LAWYER,
    },
  });

  await setSessionCookie(user.id);
  redirect("/join-organization");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
