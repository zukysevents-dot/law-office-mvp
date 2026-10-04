import { expect, test, type Page } from "@playwright/test";

import type { RoleKey } from "./support/e2e-env";
import { expectNoErrorPage, pageAs } from "./support/helpers";

async function expectAccessDenied(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Přístup odepřen", level: 2 }),
  ).toBeVisible();
  // Odepření musí být srozumitelná stránka, ne obecná chybová hláška.
  await expectNoErrorPage(page);
}

test.describe("viditelnost v navigaci", () => {
  test("administrátor vidí správu, audit i fakturaci", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Hlavní navigace" });

    await expect(nav.getByRole("link", { name: "Audit log" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Kancelář" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Fakturace" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "AML / KYC" })).toBeVisible();
  });

  test("koncipient nevidí administrativní položky menu", async ({ browser }) => {
    const page = await pageAs(browser, "trainee");
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Hlavní navigace" });

    await expect(nav.getByRole("link", { name: "Audit log" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Kancelář" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "AML / KYC" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Fakturace" })).toHaveCount(0);
    // Běžné moduly zůstávají dostupné.
    await expect(nav.getByRole("link", { name: "Úkoly", exact: true })).toBeVisible();
    await page.context().close();
  });
});

// Skrytí položky v menu není bezpečnost — přímé URL musí odepřít taky.
const guardedRoutes: Array<{ route: string; roles: RoleKey[] }> = [
  { route: "/audit-log", roles: ["trainee", "intern"] },
  { route: "/aml", roles: ["trainee", "lawyer"] },
  { route: "/settings/organization", roles: ["trainee", "lawyer"] },
  { route: "/reports/by-person", roles: ["trainee"] },
  { route: "/billing", roles: ["trainee"] },
  { route: "/billing/invoices", roles: ["trainee"] },
  { route: "/billing/invoices/new", roles: ["trainee"] },
  { route: "/billing/retainers", roles: ["trainee"] },
];

for (const guarded of guardedRoutes) {
  for (const role of guarded.roles) {
    test(`${role} nedostane ${guarded.route} ani přímou URL`, async ({
      browser,
    }) => {
      const page = await pageAs(browser, role);
      await page.goto(guarded.route);

      await expectAccessDenied(page);
      await page.context().close();
    });
  }
}

test.describe("citlivá data podle role", () => {
  test("administrátor vidí sloupec s hodinovou sazbou", async ({ page }) => {
    await page.goto("/subjects");

    await expect(
      page.getByRole("columnheader", { name: "Hodinová sazba" }),
    ).toBeVisible();
  });

  test("koncipient nevidí sazby ani částky v subjektech", async ({ browser }) => {
    const page = await pageAs(browser, "trainee");
    await page.goto("/subjects");

    await expect(
      page.getByRole("columnheader", { name: "Hodinová sazba" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("columnheader", { name: "Paušální odměna" }),
    ).toHaveCount(0);
    await page.context().close();
  });

  test("koncipient nemá ve výkazech práce pole pro sazbu", async ({ browser }) => {
    const page = await pageAs(browser, "trainee");
    // Formulář žije v modálu, který se otevírá přes ?new=1.
    await page.goto("/work-logs?new=1");
    const form = page.getByRole("dialog", { name: "Nový výkaz práce" });

    await expect(form.getByLabel("Hodiny")).toBeVisible();
    await expect(form.getByLabel("Sazba")).toHaveCount(0);
    await page.context().close();
  });

  test("praktikant nemůže zakládat subjekty", async ({ browser }) => {
    const page = await pageAs(browser, "intern");
    await page.goto("/subjects");

    await expect(
      page.getByRole("heading", { name: "Subjekty", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nový subjekt", level: 2 }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Vytvořit subjekt" }),
    ).toHaveCount(0);
    await page.context().close();
  });

  test("koncipient nemůže archivovat cizí záznam", async ({ browser }) => {
    const page = await pageAs(browser, "trainee");
    await page.goto("/subjects");
    await page.getByRole("link", { name: "ABC s.r.o." }).first().click();
    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);

    await expect(
      page.getByRole("button", { name: "Archivovat záznam" }),
    ).toHaveCount(0);
    await page.context().close();
  });
});

test.describe("organizační kontext", () => {
  test("platform admin bez členství skončí v /admin", async ({ browser }) => {
    const page = await pageAs(browser, "platformAdmin");
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/admin$/);
    await expectNoErrorPage(page);
    await page.context().close();
  });

  test("běžný administrátor kanceláře nemá platformní /admin", async ({
    page,
  }) => {
    await page.goto("/admin");

    // Není platform admin → nesmí vidět seznam všech organizací.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Správa platformy", level: 1 }),
    ).toHaveCount(0);
  });

  test("partner vidí data celé kanceláře", async ({ browser }) => {
    const page = await pageAs(browser, "partner");
    await page.goto("/work-logs");

    await expect(
      page.getByRole("heading", { name: "Seznam výkazů práce", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Sazba" }),
    ).toBeVisible();
    await page.context().close();
  });
});
