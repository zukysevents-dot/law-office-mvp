import { expect, test } from "@playwright/test";

import {
  collectConsoleErrors,
  expectNoHorizontalScroll,
} from "./support/helpers";

// Everything here is for a signed-OUT visitor.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("veřejné stránky", () => {
  test("landing page se načte s hlavním nadpisem a CTA", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "Celá advokátní kancelář na jedné oběžné dráze.",
        level: 1,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Spustit systém" }).first(),
    ).toBeVisible();
  });

  test("landing page nemá žádnou chybu v konzoli", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/", { waitUntil: "networkidle" });
    expect(errors).toEqual([]);
  });

  test("CTA na landingu vede na přihlášení", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Spustit systém" }).first().click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Přihlášení", level: 1 }),
    ).toBeVisible();
  });

  test("login má přístupně popsaná pole i tlačítko", async ({ page }) => {
    await page.goto("/login");

    const email = page.getByLabel("E-mail");
    const password = page.getByLabel("Heslo");
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute("type", "email");
    await expect(password).toBeVisible();
    await expect(password).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Přihlásit se" })).toBeEnabled();
  });

  test("registrace se načte a formulář je přístupný", async ({ page }) => {
    await page.goto("/register");

    await expect(
      page.getByRole("heading", { name: "Vytvoření účtu", level: 1 }),
    ).toBeVisible();
    for (const label of ["Jméno a příjmení", "E-mail", "Heslo"]) {
      await expect(page.getByLabel(label)).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: "Odeslat potvrzovací odkaz" }),
    ).toBeEnabled();
  });

  // Regrese: /login byl slepá ulička — nový uživatel se odsud nedostal ani na
  // registraci, ani zpět na úvodní stránku.
  test("z přihlášení vede odkaz na registraci i zpět na úvod", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Zpět na úvodní stránku" })).toBeVisible();

    await page.getByRole("link", { name: "Zaregistrujte se" }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(
      page.getByRole("heading", { name: "Vytvoření účtu", level: 1 }),
    ).toBeVisible();
  });

  test("z registrace vede funkční odkaz zpět na přihlášení", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: "Přihlaste se" }).click();

    await expect(page).toHaveURL(/\/login$/);
  });

  test("neexistující veřejná cesta zobrazí použitelnou 404", async ({ page }) => {
    const response = await page.goto("/tato-stranka-neexistuje");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Tuto stránku jsme nenašli", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Zpět na dashboard" }),
    ).toBeVisible();
  });

  test("landing na mobilu nescrolluje vodorovně", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });

    await expectNoHorizontalScroll(page);
  });
});
