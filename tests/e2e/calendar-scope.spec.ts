import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "./support/e2e-env";
import { e2eName, expectNoErrorPage, pageAs } from "./support/helpers";

// Testování 19. 10.: „Uživatelé nemají vlastní kalendář, ale vidí všechny
// úkoly všech." Výchozí pohled je „Můj kalendář"; „Celá kancelář" jen s
// oprávněním (vedení), a vždy v mezích viditelnosti.

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function pragueToday(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function insertTaskFor(email: string, title: string) {
  await withDb((client) =>
    client.query(
      `INSERT INTO "tasks"
         ("id", "organizationId", "title", "status", "deadline", "assignedToId",
          "createdById", "createdAt", "updatedAt")
       SELECT $1, m."organizationId", $2, 'CREATED', $3::date, u."id", u."id", now(), now()
       FROM "users" u
       JOIN "organizationMembers" m ON m."userId" = u."id" AND m."status" = 'ACTIVE'
       WHERE u."email" = $4
       LIMIT 1`,
      [`e2e-task-${Math.random().toString(36).slice(2, 10)}`, title, pragueToday(), email],
    ),
  );
}

async function events(page: Page) {
  await page.waitForLoadState("networkidle");
  return page.locator(".fc-event");
}

test("kalendář: výchozí je můj kalendář, celá kancelář jen pro vedení", async ({ browser }) => {
  const lawyerTask = e2eName("kal-advokat");
  const partnerTask = e2eName("kal-partner");
  await insertTaskFor("advokat.demo@example.local", lawyerTask);
  await insertTaskFor("partner.demo@example.local", partnerTask);

  const lawyer = await pageAs(browser, "lawyer");
  await lawyer.goto("/calendar");
  await expectNoErrorPage(lawyer);
  const scope = lawyer.getByRole("group", { name: "Čí kalendář zobrazit" });
  await expect(scope.getByRole("button", { name: "Můj kalendář" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(scope.getByRole("button", { name: "Celá kancelář" })).toHaveCount(0);
  await expect((await events(lawyer)).filter({ hasText: lawyerTask })).toHaveCount(1);
  await expect((await events(lawyer)).filter({ hasText: partnerTask })).toHaveCount(0);
  await lawyer.context().close();

  const partner = await pageAs(browser, "partner");
  await partner.goto("/calendar");
  await expect((await events(partner)).filter({ hasText: partnerTask })).toHaveCount(1);
  await expect((await events(partner)).filter({ hasText: lawyerTask })).toHaveCount(0);
  await partner
    .getByRole("group", { name: "Čí kalendář zobrazit" })
    .getByRole("button", { name: "Celá kancelář" })
    .click();
  await expect((await events(partner)).filter({ hasText: lawyerTask })).toHaveCount(1);
  await partner.context().close();
});
