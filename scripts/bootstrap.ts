import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  ModuleKey,
  ModuleStatus,
  OrganizationMemberStatus,
  OrganizationStatus,
  UserRole,
} from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/password";

// Bootstrap a real office + a full-rights account WITHOUT any demo data.
// "Full rights" = platform admin (manage all orgs + toggle modules in /admin)
// AND org ADMIN (sees all legal data) with every module enabled.
//
// Configure via env (all optional; sensible local defaults):
//   BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, BOOTSTRAP_NAME,
//   BOOTSTRAP_ORG_NAME, BOOTSTRAP_ORG_SLUG, BOOTSTRAP_SEAT_LIMIT
// Re-running is idempotent and resets the password to the configured value.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const email = (process.env.BOOTSTRAP_EMAIL ?? "admin@kancelar.local")
  .trim()
  .toLowerCase();
const password = process.env.BOOTSTRAP_PASSWORD ?? "admin1234";
const name = process.env.BOOTSTRAP_NAME ?? "Správce kanceláře";
const orgName = process.env.BOOTSTRAP_ORG_NAME ?? "Moje kancelář";
const orgSlug = (process.env.BOOTSTRAP_ORG_SLUG ?? "moje-kancelar")
  .trim()
  .toLowerCase();
const seatLimit = Number(process.env.BOOTSTRAP_SEAT_LIMIT ?? "25");

async function main() {
  if (password.length < 8) {
    throw new Error("BOOTSTRAP_PASSWORD musí mít alespoň 8 znaků.");
  }

  // 1) Organization
  const organization = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: { name: orgName, status: OrganizationStatus.ACTIVE },
    create: {
      name: orgName,
      slug: orgSlug,
      seatLimit: Number.isFinite(seatLimit) ? seatLimit : 25,
      status: OrganizationStatus.ACTIVE,
    },
  });

  // 2) Enable every sellable module for this org.
  const sellable = Object.values(ModuleKey).filter((k) => k !== ModuleKey.CORE);
  for (const moduleKey of sellable) {
    await prisma.organizationModule.upsert({
      where: { organizationId_moduleKey: { organizationId: organization.id, moduleKey } },
      update: { status: ModuleStatus.ENABLED, enabledAt: new Date(), disabledAt: null },
      create: {
        organizationId: organization.id,
        moduleKey,
        status: ModuleStatus.ENABLED,
        enabledAt: new Date(),
      },
    });
  }

  // 3) Full-rights user: platform admin + (org-level) ADMIN.
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: UserRole.ADMIN, active: true, isPlatformAdmin: true, passwordHash },
    create: {
      email,
      name,
      role: UserRole.ADMIN,
      active: true,
      isPlatformAdmin: true,
      passwordHash,
    },
  });

  // 4) ADMIN membership in the office org (so they use the app, not just /admin).
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: { role: UserRole.ADMIN, status: OrganizationMemberStatus.ACTIVE },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: UserRole.ADMIN,
      status: OrganizationMemberStatus.ACTIVE,
      approvedAt: new Date(),
    },
  });

  console.log("\n✅ Účet s plnými právy připraven:\n");
  console.log(`   Kancelář : ${orgName} (slug: ${orgSlug})`);
  console.log(`   Login    : ${email}`);
  console.log(`   Heslo    : ${password}`);
  console.log(`   Práva    : platform admin (/admin) + ADMIN kanceláře`);
  console.log(`   Moduly   : všechny zapnuté (${sellable.length})`);
  console.log(`\n   Přihlášení: ${process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3001"}/login\n`);
  console.log("   ⚠️  Po prvním přihlášení si v produkci heslo změň.\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
