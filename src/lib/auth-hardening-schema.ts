import { getPrisma } from "@/lib/prisma";

// The auth hardening migration is intentionally additive. Checking for its two
// User columns lets a newly deployed app keep existing staff able to sign in
// while an older production database is being brought up to date. The next
// deployment after `prisma migrate deploy` takes the hardened branch again.
export async function hasAuthHardeningSchema(): Promise<boolean> {
  const columns = await getPrisma().$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'users'
      AND column_name IN ('emailVerifiedAt', 'sessionVersion')
  `;

  return columns.length === 2;
}
