import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Resolves the signed-in user from the session cookie. Route access is gated by
// src/proxy.ts, so by the time this runs a valid cookie is normally present;
// the redirect here is a defense-in-depth fallback (e.g. user deactivated or
// deleted after the cookie was issued).
export async function getCurrentUser() {
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
}
