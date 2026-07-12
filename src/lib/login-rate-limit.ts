import { createHmac } from "node:crypto";

import { getPrisma } from "@/lib/prisma";

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX_PER_ACCOUNT = 5;
export const LOGIN_RATE_LIMIT_MAX_PER_IP = 30;
export const AUTH_LEDGER_CLEANUP_PROBABILITY = 0.01;

export function normalizeLoginIdentifier(email: string): string {
  return email.trim().toLowerCase();
}

function identifierSecret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set to protect login rate-limit identifiers.",
    );
  }
  return "dev-insecure-session-secret-change-me-32+";
}

// HMAC prevents a DB-only attacker from enumerating low-entropy addresses with
// an offline dictionary.
export function hashLoginIdentifier(email: string): string {
  return createHmac("sha256", identifierSecret())
    .update(normalizeLoginIdentifier(email))
    .digest("hex");
}

export function isWithinLoginRateLimit(
  attemptsForIp: number,
  attemptsForAccount: number,
): boolean {
  return (
    attemptsForIp < LOGIN_RATE_LIMIT_MAX_PER_IP &&
    attemptsForAccount < LOGIN_RATE_LIMIT_MAX_PER_ACCOUNT
  );
}

export function orderedThrottleLockKeys(
  scope: string,
  ipAddress: string,
  identifierHash: string,
): string[] {
  // Every transaction locks in lexical order, preventing deadlocks when two
  // requests share only one of their IP/account buckets.
  return [
    `${scope}:account:${identifierHash}`,
    `${scope}:ip:${ipAddress}`,
  ].sort();
}

export function shouldCleanupAuthLedgers(sample: number): boolean {
  return sample < AUTH_LEDGER_CLEANUP_PROBABILITY;
}

type AttemptLedgerOperations = {
  countForIp: () => Promise<number>;
  countForIdentifier: () => Promise<number>;
  createAttempt: () => Promise<string>;
};

// Transaction-body primitive shared by login/registration. The caller first
// acquires both advisory locks, then supplies operations bound to that same DB
// transaction. Exported so tests can assert the security-critical ordering and
// the fact that blocked calls are still recorded.
export async function decideAndRecordThrottleAttempt(
  operations: AttemptLedgerOperations,
  maxPerIp: number,
  maxPerIdentifier: number,
): Promise<{ allowed: boolean; attemptId: string }> {
  const [attemptsForIp, attemptsForIdentifier] = await Promise.all([
    operations.countForIp(),
    operations.countForIdentifier(),
  ]);
  const attemptId = await operations.createAttempt();
  return {
    allowed:
      attemptsForIp < maxPerIp &&
      attemptsForIdentifier < maxPerIdentifier,
    attemptId,
  };
}

export type LoginAttemptReservation = {
  allowed: boolean;
  attemptId: string;
};

// Atomically reserves this attempt BEFORE password verification. Advisory
// transaction locks serialize both buckets across all serverless instances;
// the row is written even when the budget is exhausted, so sustained abuse
// keeps the window saturated. A successful login removes its account rows.
export async function reserveLoginAttempt(
  ipAddress: string,
  identifierHash: string,
): Promise<LoginAttemptReservation> {
  const prisma = getPrisma();
  const windowStart = new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_MS);

  const reservation = await prisma.$transaction(async (tx) => {
    for (const lockKey of orderedThrottleLockKeys(
      "login",
      ipAddress,
      identifierHash,
    )) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    }

    return decideAndRecordThrottleAttempt(
      {
        countForIp: () => tx.loginAttempt.count({
        where: { ipAddress, createdAt: { gt: windowStart } },
        }),
        countForIdentifier: () => tx.loginAttempt.count({
        where: { identifierHash, createdAt: { gt: windowStart } },
        }),
        createAttempt: async () => (
          await tx.loginAttempt.create({
            data: { ipAddress, identifierHash },
            select: { id: true },
          })
        ).id,
      },
      LOGIN_RATE_LIMIT_MAX_PER_IP,
      LOGIN_RATE_LIMIT_MAX_PER_ACCOUNT,
    );
  });

  // A standalone createdAt index makes this rare global retention sweep cheap.
  // It is deliberately outside the security-critical reservation transaction.
  if (shouldCleanupAuthLedgers(Math.random())) {
    try {
      await prisma.loginAttempt.deleteMany({
        where: { createdAt: { lt: windowStart } },
      });
    } catch {
      // housekeeping only
    }
  }

  return reservation;
}

export async function clearAccountLoginFailures(
  identifierHash: string,
): Promise<void> {
  await getPrisma().loginAttempt.deleteMany({ where: { identifierHash } });
}
