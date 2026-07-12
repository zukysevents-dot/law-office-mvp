import { getPrisma } from "@/lib/prisma";
import {
  decideAndRecordThrottleAttempt,
  orderedThrottleLockKeys,
  shouldCleanupAuthLedgers,
} from "@/lib/login-rate-limit";

export const REGISTRATION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const REGISTRATION_RATE_LIMIT_MAX_PER_ADDRESS = 3;
export const REGISTRATION_RATE_LIMIT_MAX_PER_IP = 20;

export function isWithinRegistrationRateLimit(
  attemptsForIp: number,
  attemptsForAddress: number,
): boolean {
  return (
    attemptsForIp < REGISTRATION_RATE_LIMIT_MAX_PER_IP &&
    attemptsForAddress < REGISTRATION_RATE_LIMIT_MAX_PER_ADDRESS
  );
}

// Same atomic reservation pattern as staff login. Registration attempts are
// never cleared on success: this is an e-mail-spam quota, not a credential
// failure counter, and applies equally to existing/non-existing addresses.
export async function reserveRegistrationAttempt(
  ipAddress: string,
  identifierHash: string,
): Promise<boolean> {
  const prisma = getPrisma();
  const windowStart = new Date(Date.now() - REGISTRATION_RATE_LIMIT_WINDOW_MS);

  const allowed = await prisma.$transaction(async (tx) => {
    for (const lockKey of orderedThrottleLockKeys(
      "registration",
      ipAddress,
      identifierHash,
    )) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    }

    return (
      await decideAndRecordThrottleAttempt(
        {
          countForIp: () => tx.registrationAttempt.count({
            where: { ipAddress, createdAt: { gt: windowStart } },
          }),
          countForIdentifier: () => tx.registrationAttempt.count({
            where: { identifierHash, createdAt: { gt: windowStart } },
          }),
          createAttempt: async () => (
            await tx.registrationAttempt.create({
              data: { ipAddress, identifierHash },
              select: { id: true },
            })
          ).id,
        },
        REGISTRATION_RATE_LIMIT_MAX_PER_IP,
        REGISTRATION_RATE_LIMIT_MAX_PER_ADDRESS,
      )
    ).allowed;
  });

  if (shouldCleanupAuthLedgers(Math.random())) {
    try {
      await prisma.registrationAttempt.deleteMany({
        where: { createdAt: { lt: windowStart } },
      });
    } catch {
      // housekeeping only
    }
  }

  return allowed;
}
