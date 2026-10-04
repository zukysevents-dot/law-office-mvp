import { expect, test } from "@playwright/test";

import { E2E_PASSWORD, E2E_USERS } from "./support/e2e-env";
import { appAlert, loginViaForm, logout } from "./support/helpers";

// These specs exercise the login/logout flows themselves, so they must start
// signed out.
test.use({ storageState: { cookies: [], origins: [] } });

const protectedRoutes = [
  "/dashboard",
  "/subjects",
  "/tasks",
  "/work-logs",
  "/billing",
  "/audit-log",
  "/settings/organization",
];

for (const route of protectedRoutes) {
  test(`nepřihlášený uživatel je z ${route} přesměrován na /login`, async ({
    page,
  }) => {
    await page.goto(route);

    await expect(page).toHaveURL(
      new RegExp(`/login\\?from=${encodeURIComponent(route).replace(/%2F/g, "%2F")}`),
    );
    await expect(
      page.getByRole("heading", { name: "Přihlášení", level: 1 }),
    ).toBeVisible();
  });
}

test("po přihlášení se uživatel vrátí na původně požadovanou stránku", async ({
  page,
}) => {
  await page.goto("/references");
  await expect(page).toHaveURL(/\/login\?from=/);

  await loginViaForm(page, "admin");

  await expect(page).toHaveURL(/\/references$/);
  await expect(
    page.getByRole("heading", { name: "Reference", level: 1 }),
  ).toBeVisible();
});

test("správné přihlášení přesměruje na dashboard", async ({ page }) => {
  await page.goto("/login");
  await loginViaForm(page, "admin");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
});

test("špatné heslo zobrazí obecnou chybovou hlášku", async ({ page }) => {
  await page.goto("/login");
  await loginViaForm(page, "lawyer", "rozhodne-spatne-heslo");

  await expect(page).toHaveURL(/\/login\?error=/);
  await expect(appAlert(page)).toHaveText(
    "Nesprávný e-mail nebo heslo.",
  );
});

test("neexistující e-mail nezpůsobí technickou chybu", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("nikdo.takovy@example.local");
  await page.getByLabel("Heslo").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se" }).click();

  // Identical message as a wrong password — no account enumeration, no 500.
  await expect(appAlert(page)).toHaveText(
    "Nesprávný e-mail nebo heslo.",
  );
  await expect(
    page.getByRole("heading", { name: "Něco se pokazilo" }),
  ).toHaveCount(0);
});

test("prázdný formulář neodejde — platí HTML validace", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Přihlásit se" }).click();

  await expect(page).toHaveURL(/\/login$/);
  const emailState = await page
    .getByLabel("E-mail")
    .evaluate((input: HTMLInputElement) => ({
      valid: input.checkValidity(),
      message: input.validationMessage,
    }));
  expect(emailState.valid).toBe(false);
  expect(emailState.message).not.toBe("");
});

test("neplatný formát e-mailu neprojde HTML validací", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("tohle-neni-email");
  await page.getByLabel("Heslo").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se" }).click();

  await expect(page).toHaveURL(/\/login$/);
  const valid = await page
    .getByLabel("E-mail")
    .evaluate((input: HTMLInputElement) => input.checkValidity());
  expect(valid).toBe(false);
});

test("po odhlášení nelze zpět na chráněnou stránku tlačítkem Back", async ({
  page,
}) => {
  await page.goto("/login");
  await loginViaForm(page, "partner");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/subjects");
  await expect(
    page.getByRole("heading", { name: "Subjekty", level: 1 }),
  ).toBeVisible();

  await logout(page);

  await page.goBack();
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Subjekty", level: 1 }),
  ).toHaveCount(0);
});

test("parametr from nesmí přesměrovat na externí URL", async ({ page }) => {
  await page.goto("/login?from=https://example.com/utok");
  await loginViaForm(page, "admin");

  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/dashboard$/);
});

test("protokolově relativní from nesmí opustit aplikaci", async ({ page }) => {
  await page.goto("/login?from=%2F%2Fexample.com%2Futok");
  await loginViaForm(page, "admin");

  expect(new URL(page.url()).hostname).toBe("127.0.0.1");
});

test("přihlášení respektuje velikost písmen v e-mailu", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_USERS.lawyer.email.toUpperCase());
  await page.getByLabel("Heslo").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit se" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
});
