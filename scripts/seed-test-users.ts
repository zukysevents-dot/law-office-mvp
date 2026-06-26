import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { OrganizationMemberStatus, UserRole } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/password";

// Vytvoří sadu testovacích účtů (jeden na každou roli) v existující organizaci.
// Idempotentní — re-run resetuje jméno/roli/heslo. Pro zkoušení oprávnění.
//
// Env (vše volitelné):
//   SEED_ORG_SLUG        slug organizace (default "syndikat")
//   SEED_TEST_PASSWORD   sdílené heslo pro všechny účty (default "Test1234")

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ORG_SLUG = (process.env.SEED_ORG_SLUG ?? "syndikat").trim().toLowerCase();
const PASSWORD = process.env.SEED_TEST_PASSWORD ?? "Test1234";

const accounts = [
  { email: "admin@syndikat.test", name: "Test Admin", role: UserRole.ADMIN },
  { email: "partner@syndikat.test", name: "Test Partner", role: UserRole.PARTNER },
  { email: "advokat@syndikat.test", name: "Test Advokát", role: UserRole.LAWYER },
  { email: "koncipient@syndikat.test", name: "Test Koncipient", role: UserRole.TRAINEE },
  { email: "stazista@syndikat.test", name: "Test Stážista", role: UserRole.INTERN },
];

async function main() {
  if (PASSWORD.length < 8) {
    throw new Error("SEED_TEST_PASSWORD musí mít alespoň 8 znaků.");
  }

  const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (!org) {
    throw new Error(
      `Organizace se slugem "${ORG_SLUG}" neexistuje. Spusť nejdřív npm run db:bootstrap.`,
    );
  }

  const passwordHash = await hashPassword(PASSWORD);

  console.log(`\n✅ Testovací účty v org "${org.name}" (${ORG_SLUG}):\n`);
  for (const acc of accounts) {
    const email = acc.email.toLowerCase();
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: acc.name,
        role: acc.role,
        active: true,
        isPlatformAdmin: false,
        passwordHash,
      },
      create: {
        email,
        name: acc.name,
        role: acc.role,
        active: true,
        isPlatformAdmin: false,
        passwordHash,
      },
    });

    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: { role: acc.role, status: OrganizationMemberStatus.ACTIVE },
      create: {
        organizationId: org.id,
        userId: user.id,
        role: acc.role,
        status: OrganizationMemberStatus.ACTIVE,
        approvedAt: new Date(),
      },
    });

    console.log(`   ${acc.role.padEnd(8)}  ${email}`);
  }

  console.log(`\n   Heslo (všichni): ${PASSWORD}`);
  console.log(`   Přihlášení: ${process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3001"}/login\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
