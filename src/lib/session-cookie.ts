import { cookies } from "next/headers";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
} from "@/lib/session";

// Cookie mutation belongs in a Server Action/Route Handler. Keeping the exact
// options centralized prevents a refreshed post-password-change cookie from
// drifting from a normal login cookie.
export async function setUserSessionCookie(
  userId: string,
  sessionVersion: number,
): Promise<void> {
  const token = await signSession(userId, SESSION_MAX_AGE, sessionVersion);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}
