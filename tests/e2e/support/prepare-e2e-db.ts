import { execFileSync } from "node:child_process";

import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";

import { PrismaClient } from "../../../src/generated/prisma/client";
import { ModuleStatus } from "../../../src/generated/prisma/enums";
import { E2E_DATABASE_URL, E2E_PREFIX } from "./e2e-env";

// Prepares the dedicated, disposable E2E database. Idempotent: safe to re-run
// before every suite. It never touches the developer's own `law_office_mvp`.
// Run through tsx (see global-setup.ts) because the generated Prisma client is
// ESM and Playwright's own transpiler loads config modules as CJS.

function run(command: string, args: string[]) {
  // prisma.config.ts prefers DIRECT_URL — an empty string would win over the
  // DATABASE_URL fallback and leave the CLI without a connection URL, so the
  // key is dropped rather than blanked.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DIRECT_URL;
  env.DATABASE_URL = E2E_DATABASE_URL;
  execFileSync(command, args, { stdio: "inherit", env });
}

async function ensureDatabaseExists() {
  const url = new URL(E2E_DATABASE_URL);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  url.pathname = "/postgres";

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database],
    );
    if (existing.rowCount === 0) {
      // An identifier cannot be parameterised; `database` comes from our own URL.
      await client.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  await ensureDatabaseExists();

  run("npx", ["prisma", "migrate", "deploy"]);
  run("npx", ["tsx", "prisma/seed.ts"]);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: E2E_DATABASE_URL }),
  });

  try {
    // Deterministic entitlements: the seed leaves some modules on a TRIAL with a
    // hard-coded end date, and AML / DATA_BOXES off entirely. Tests must not
    // start failing the day a trial lapses, so pin everything to ENABLED.
    const modules = await prisma.module.findMany({ select: { key: true } });
    const organizations = await prisma.organization.findMany({
      select: { id: true },
    });
    for (const organization of organizations) {
      for (const moduleRow of modules) {
        await prisma.organizationModule.upsert({
          where: {
            organizationId_moduleKey: {
              organizationId: organization.id,
              moduleKey: moduleRow.key,
            },
          },
          update: { status: ModuleStatus.ENABLED, trialEndsAt: null },
          create: {
            organizationId: organization.id,
            moduleKey: moduleRow.key,
            status: ModuleStatus.ENABLED,
          },
        });
      }
    }

    // Drop leftovers from previous runs. Only `e2e-` prefixed rows, never seed
    // or developer data.
    const staleTaskIds = (
      await prisma.task.findMany({
        where: { title: { startsWith: E2E_PREFIX } },
        select: { id: true },
      })
    ).map((task) => task.id);
    if (staleTaskIds.length > 0) {
      await prisma.workLog.deleteMany({ where: { taskId: { in: staleTaskIds } } });
      await prisma.taskComment.deleteMany({
        where: { taskId: { in: staleTaskIds } },
      });
      await prisma.taskStatusHistory.deleteMany({
        where: { taskId: { in: staleTaskIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: "Task", entityId: { in: staleTaskIds } },
      });
      await prisma.task.deleteMany({ where: { id: { in: staleTaskIds } } });
    }
    await prisma.workLog.deleteMany({
      where: { description: { startsWith: E2E_PREFIX } },
    });

    const staleSubjectIds = (
      await prisma.subject.findMany({
        where: { name: { startsWith: E2E_PREFIX } },
        select: { id: true },
      })
    ).map((subject) => subject.id);
    if (staleSubjectIds.length > 0) {
      await prisma.subjectRelation.deleteMany({
        where: { subjectId: { in: staleSubjectIds } },
      });
      await prisma.conflictCheck.deleteMany({
        where: { subjectId: { in: staleSubjectIds } },
      });
      await prisma.contactPerson.deleteMany({
        where: { subjectId: { in: staleSubjectIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: "Subject", entityId: { in: staleSubjectIds } },
      });
      await prisma.subject.deleteMany({ where: { id: { in: staleSubjectIds } } });
    }

    // Login throttling is per-IP (30 attempts / 15 min) and every run signs six
    // users in. Start from a clean ledger so a rerun is never rate-limited.
    await prisma.loginAttempt.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
