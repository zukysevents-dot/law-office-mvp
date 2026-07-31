import { expect, test } from "@playwright/test";

import { E2E_USERS } from "./support/e2e-env";
import {
  expectNoErrorPage,
  openCommandPalette,
  openMobileMenu,
} from "./support/helpers";

const MOBILE = { width: 390, height: 844 };

test.describe("aplikační shell a navigace (administrátor)", () => {
  test("dashboard se vykreslí i s uživatelským kontextem", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(E2E_USERS.admin.name).first()).toBeVisible();
    await expectNoErrorPage(page);
  });

  test("levá navigace obsahuje položky aktivních modulů", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Hlavní navigace" });

    for (const label of [
      "Dashboard",
      "Subjekty",
      "Conflict check",
      "Hlídání rejstříků",
      "AML / KYC",
      "Projekty",
      "Případy",
      "Datové schránky",
      "Úkoly",
      "Výkazy práce",
      "Fakturace",
      "Reporty",
      "Reference",
      "Lhůtník",
      "Kalendář",
      "Zaměstnanci",
      "Audit log",
      "Nastavení",
    ]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveCount(
        1,
      );
    }
  });

  const navTargets = [
    { label: "Subjekty", url: /\/subjects$/, heading: "Subjekty" },
    { label: "Úkoly", url: /\/tasks$/, heading: "Úkoly" },
    { label: "Reporty", url: /\/reports$/, heading: "Reporty a exporty" },
    { label: "Lhůtník", url: /\/deadlines$/, heading: "Lhůtník" },
  ];

  for (const target of navTargets) {
    test(`navigace „${target.label}“ vede na správnou stránku`, async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await page
        .getByRole("navigation", { name: "Hlavní navigace" })
        .getByRole("link", { name: target.label, exact: true })
        .click();

      await expect(page).toHaveURL(target.url);
      await expect(
        page.getByRole("heading", { name: target.heading, level: 1 }),
      ).toBeVisible();
    });
  }

  test("aktivní položka navigace má aria-current=page", async ({ page }) => {
    await page.goto("/subjects");
    const nav = page.getByRole("navigation", { name: "Hlavní navigace" });

    await expect(
      nav.getByRole("link", { name: "Subjekty", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      nav.getByRole("link", { name: "Dashboard", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("odkaz „Přeskočit na obsah“ přesune fokus do hlavního obsahu", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Tab");

    const skipLink = page.getByRole("link", { name: "Přeskočit na obsah" });
    await expect(skipLink).toBeFocused();
    await skipLink.press("Enter");

    await expect(page.locator("#app-main")).toBeFocused();
  });

  test("odhlášení funguje z aplikačního shellu", async ({ browser }) => {
    // Vlastní kontext — odhlášení nesmí zneplatnit sdílený storage state.
    const context = await browser.newContext({
      storageState: "tests/e2e/.auth/lawyer.json",
    });
    const page = await context.newPage();
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Odhlásit se" }).first().click();

    await expect(page).toHaveURL(/\/login$/);
    await context.close();
  });

  test("příkazová paleta se otevře přes ⌘K a zavře Escapem", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("dialog")).toBeHidden();

    const palette = await openCommandPalette(page);
    const input = palette.getByPlaceholder("Hledat subjekt, projekt, případ, úkol…");
    await expect(input).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    // Fokus se nesmí ztratit mimo ovladatelnou oblast.
    await expect(page.locator("body")).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.tagName ?? null),
    ).not.toBeNull();
  });

  // Regrese: mezi 1024 a 1279 px vyhrálo v Tailwindu `inline-flex` z komponenty
  // loga nad `hidden` z volajícího, takže se v úzké liště zobrazil oříznutý
  // wordmark a kompaktní značka měla nulovou šířku.
  test("úzká lišta na 1024 px zobrazí jen kompaktní značku", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/dashboard");

    const header = await page.evaluate(() => {
      const links = [...document.querySelectorAll("aside a[aria-label='IURIVERSE']")];
      const rail = links.at(-1);
      // `:scope >` cíleně míjí značku uvnitř skrytého wordmarku.
      const mark = rail?.querySelector(":scope > svg");
      const wordmark = [...(rail?.querySelectorAll("span") ?? [])].find(
        (span) => span.textContent?.trim() === "IURIVERSE",
      );
      return {
        markWidth: mark?.getBoundingClientRect().width ?? 0,
        wordmarkWidth: wordmark?.getBoundingClientRect().width ?? 0,
      };
    });

    expect(header.markWidth).toBeGreaterThan(0);
    expect(header.wordmarkWidth).toBe(0);
  });

  // Regrese: hledání šlo otevřít jen zkratkou ⌘K. Bez klávesnice (dotykové
  // zařízení) nebo bez znalosti zkratky bylo nedostupné.
  test("hledání jde otevřít myší z levého panelu", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page
      .getByRole("navigation", { name: "Hlavní navigace" })
      .getByRole("button", { name: "Hledat v celé aplikaci" })
      .click();

    const palette = page.getByRole("dialog", { name: "Rychlé hledání" });
    await expect(palette).toBeVisible();
    await expect(
      palette.getByRole("searchbox", {
        name: "Hledat subjekt, projekt, případ nebo úkol",
      }),
    ).toBeFocused();
  });

  test("hledání jde otevřít na mobilu z horní lišty", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/dashboard");

    await page
      .getByRole("button", { name: "Hledat v celé aplikaci" })
      .click();

    await expect(page.getByRole("dialog", { name: "Rychlé hledání" })).toBeVisible();
  });

  test("příkazová paleta najde subjekt a přejde na něj", async ({ page }) => {
    await page.goto("/dashboard");
    const palette = await openCommandPalette(page);
    await palette
      .getByPlaceholder("Hledat subjekt, projekt, případ, úkol…")
      .fill("ABC");

    await palette.getByRole("button", { name: /ABC s\.r\.o\./ }).first().click();
    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);
  });
});

test.describe("mobilní navigace", () => {
  test.use({ viewport: MOBILE });

  test("mobilní menu se otevře a zavře tlačítkem", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Hlavní navigace" });
    await expect(nav).toBeHidden();

    await openMobileMenu(page);
    await page.getByRole("button", { name: "Zavřít menu" }).click();
    await expect(nav).toBeHidden();
  });

  test("mobilní menu se zavře klávesou Escape", async ({ page }) => {
    await page.goto("/dashboard");
    await openMobileMenu(page);

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("navigation", { name: "Hlavní navigace" }),
    ).toBeHidden();
    await expect(page.getByRole("button", { name: "Otevřít menu" })).toBeFocused();
  });

  test("mobilní menu se po navigaci zavře", async ({ page }) => {
    await page.goto("/dashboard");
    await openMobileMenu(page);
    await page.getByRole("link", { name: "Projekty", exact: true }).click();

    await expect(page).toHaveURL(/\/projects$/);
    await expect(
      page.getByRole("navigation", { name: "Hlavní navigace" }),
    ).toBeHidden();
  });

  test("mobilní menu drží fokus uvnitř při procházení Tabem", async ({ page }) => {
    await page.goto("/dashboard");
    await openMobileMenu(page);

    // Projdi dostatečně dlouho na to, aby fokus musel projít koncem seznamu.
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press("Tab");
    }

    const insideNav = await page.evaluate(() =>
      Boolean(document.getElementById("mobile-nav")?.contains(document.activeElement)),
    );
    expect(insideNav).toBe(true);
  });
});
