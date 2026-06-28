import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prismaClient?: InstanceType<typeof PrismaClient>;
};

// Module-level singleton. Each PrismaPg adapter opens its own pg connection
// pool, so creating a client per call would exhaust database connections in
// production. We keep exactly one client for the lifetime of the process; the
// globalThis cache additionally survives dev HMR module reloads.
let prismaClient: InstanceType<typeof PrismaClient> | undefined;

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

export function getPrisma() {
  if (prismaClient) {
    return prismaClient;
  }

  if (globalForPrisma.prismaClient) {
    prismaClient = globalForPrisma.prismaClient;
    return prismaClient;
  }

  prismaClient = createPrismaClient();

  // Cache on globalThis only in dev so HMR reuses the same client; in
  // production the module-level binding above is the single source of truth.
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prismaClient = prismaClient;
  }

  return prismaClient;
}
