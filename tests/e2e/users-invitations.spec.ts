import { createHmac, randomBytes } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import {
  E2E_DATABASE_URL,
  E2E_PREFIX,
  E2E_SERVER_ENV,
  storageStatePath,
} from "./support/e2e-env";
import { appAlert, expectNoErrorPage } from "./support/helpers";

// Audit „aplikace neposílá mail, když se založí nový uživatel“. V e2e je SMTP
// vypnuté (e2e-env.ts), takže se ověřuje vše kolem odeslání: hláška adminovi
// s důvodem, sloupec „Pozvánka“, „Znovu poslat pozvánku“ a celý průchod
// jednorázovým odkazem /set-password. Samotné doručení přes SMTP pokrývají
// unit testy mailer.test.ts / templates.test.ts.

function uniqueUser(label: string) {
  const id = `${process.pid}-${randomBytes(3).toString("hex")}`;
  return {
    name: `${E2E_PREFIX}${label}-${id}`,
    email: `${E2E_PREFIX}user-${label}-${id}@example.local`,
  };
}

async function createUserViaSettings(page: Page, user: { name: string; email: string }) {
  await page.goto("/settings");
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Nový uživatel" }),
  });
  await section.getByLabel("Jméno").fill(user.name);
  await section.getByLabel("E-mail").fill(user.email);
  await section.getByLabel("Počáteční heslo (min. 8 znaků)").fill("pocatecni-heslo-1");
  await section.getByRole("button", { name: "Vytvořit uživatele" }).click();
  return section;
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Inserts a usable invitation token (as if e-mailed) and returns its plaintext. */
async function insertInvitationToken(
  email: string,
  options: { sentAt?: Date } = {},
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHmac("sha256", E2E_SERVER_ENV.SESSION_SECRET)
    .update(`invite:${token}`)
    .digest("hex");
  await withDb(async (client) => {
    const user = await client.query<{ id: string; organizationId: string }>(
      `SELECT u.id, m."organizationId"
         FROM users u JOIN "organizationMembers" m ON m."userId" = u.id
        WHERE u.email = $1 LIMIT 1`,
      [email],
    );
    expect(user.rowCount).toBe(1);
    await client.query(
      `INSERT INTO "userInvitationTokens"
         (id, "userId", "organizationId", "tokenHash", "expiresAt", "sentAt")
       VALUES ($1, $2, $3, $4, now() + interval '72 hours', $5)`,
      [
        `e2e${randomBytes(10).toString("hex")}`,
        user.rows[0].id,
        user.rows[0].organizationId,
        tokenHash,
        options.sentAt ?? null,
      ],
    );
  });
  return token;
}

test.describe("založení uživatele a pozvánka (admin)", () => {
  test("nový uživatel se hned objeví a admin vidí, proč e-mail neodešel", async ({
    page,
  }) => {
    const user = uniqueUser("novy");
    const section = await createUserViaSettings(page, user);

    const banner = section.getByRole("status");
    await expect(banner).toContainText(`Uživatel ${user.name} byl vytvořen`);
    await expect(banner).toContainText("uvítací e-mail se neodeslal");
    await expect(banner).toContainText("EMAIL_NOTIFICATIONS_ENABLED");
    await expect(banner).toContainText("osobně");
    await expectNoErrorPage(page);

    // Bez reloadu: řádek je v tabulce uživatelů hned, pozvánka „Neodesláno“.
    const row = page.getByRole("row").filter({ hasText: user.email });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Neodesláno");

    // Karta stavu integrací vysvětluje, že SMTP není nastavené.
    await expect(page.getByRole("heading", { name: "E-mail (SMTP)" })).toBeVisible();
    await expect(page.getByText("Nenakonfigurováno").first()).toBeVisible();
  });

  test("duplicitní e-mail se ukáže ve formuláři, ne jako chybová stránka", async ({
    page,
  }) => {
    const section = await createUserViaSettings(page, {
      name: "Duplicitní",
      email: "admin.demo@example.local",
    });
    await expect(appAlert(page)).toContainText("Uživatel s tímto e-mailem už existuje.");
    await expectNoErrorPage(page);
    // Vyplněné údaje zůstanou (kromě hesla).
    await expect(section.getByLabel("Jméno")).toHaveValue("Duplicitní");
  });

  test("Znovu poslat pozvánku: hláška o neodeslání, po odeslaném e-mailu ochrana 60 s", async ({
    page,
  }) => {
    const user = uniqueUser("resend");
    const section = await createUserViaSettings(page, user);
    await expect(section.getByRole("status")).toContainText("byl vytvořen");

    const row = page.getByRole("row").filter({ hasText: user.email });
    const resend = row.getByRole("button", {
      name: `Znovu poslat pozvánku: ${user.name}`,
    });
    await resend.click();
    await expect(row.getByRole("status")).toContainText(
      "Pozvánka se neodeslala: odesílání e-mailů je na serveru vypnuté",
    );

    // Jako by právě odešel e-mail → další pokus do minuty se odmítne.
    await insertInvitationToken(user.email, { sentAt: new Date() });
    await resend.click();
    await expect(row.getByRole("status")).toContainText(
      "Pozvánka byla právě odeslána. Zkuste to znovu za minutu.",
    );
  });
});

test.describe("nastavení hesla z pozvánky (veřejné)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("neplatný odkaz ukáže srozumitelnou hlášku a žádný formulář", async ({ page }) => {
    await page.goto("/set-password?token=neplatny");
    await expect(page).toHaveURL(/\/set-password/);
    await expect(
      page.getByRole("heading", { name: "Nastavení hesla", level: 1 }),
    ).toBeVisible();
    await expect(appAlert(page)).toContainText(
      "Odkaz pro nastavení hesla je neplatný nebo už vypršel.",
    );
    await expect(page.getByLabel("Nové heslo znovu")).toHaveCount(0);
  });

  test("celý průchod: nastavení hesla, přihlášení a jednorázovost odkazu", async ({
    page,
    browser,
  }) => {
    // Uživatele založí admin (vlastní kontext), odkaz vložíme přímo do DB.
    const adminContext = await browser.newContext({
      storageState: storageStatePath("admin"),
    });
    const adminPage = await adminContext.newPage();
    const user = uniqueUser("heslo");
    const section = await createUserViaSettings(adminPage, user);
    await expect(section.getByRole("status")).toContainText("byl vytvořen");
    await adminContext.close();

    const token = await insertInvitationToken(user.email);
    const link = `/set-password?token=${token}`;
    await page.goto(link);
    await expect(page.getByText(`Nastavujete heslo pro ${user.email}`)).toBeVisible();

    const newPassword = "vlastni-heslo-42";
    await page.getByLabel("Nové heslo (min. 8 znaků)").fill(newPassword);
    await page.getByLabel("Nové heslo znovu").fill("jine-heslo-42");
    await page.getByRole("button", { name: "Nastavit heslo" }).click();
    await expect(appAlert(page)).toContainText("Hesla se neshodují.");

    await page.getByLabel("Nové heslo (min. 8 znaků)").fill(newPassword);
    await page.getByLabel("Nové heslo znovu").fill(newPassword);
    await page.getByRole("button", { name: "Nastavit heslo" }).click();

    await expect(page).toHaveURL(/\/login\?passwordSet=1$/);
    await expect(page.getByRole("status").filter({
      hasText: "Heslo je nastavené. Přihlaste se novým heslem.",
    })).toBeVisible();

    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Heslo").fill(newPassword);
    await page.getByRole("button", { name: "Přihlásit se" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // Odkaz je jednorázový.
    await page.goto(link);
    await expect(appAlert(page)).toContainText(
      "Odkaz pro nastavení hesla je neplatný nebo už vypršel.",
    );
  });
});

test.describe("bez oprávnění", () => {
  test.use({ storageState: storageStatePath("lawyer") });

  test("advokát nevidí založení uživatele ani pozvánky", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Nastavení", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nový uživatel" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Znovu poslat pozvánku/ }),
    ).toHaveCount(0);
  });
});
