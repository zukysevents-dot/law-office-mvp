import { expect, test, type Page } from "@playwright/test";

import { storageStatePath } from "./support/e2e-env";
import { e2eName, expectNoErrorPage } from "./support/helpers";

// Audit „po kliknutí se to dlouho načítá, po obnovení stránky je to hned“:
// server action s revalidatePath() musí stránku překreslit HNED, bez ručního
// reloadu, a odesílací tlačítko musí během požadavku ukazovat, že se pracuje.
// Příčinou zamrzání byl route-level loading.tsx (Next 16.2.9) – viz
// tests/e2e/README.md, „Známá omezení“.

// Partner: vlastní uživatel, aby změna sloupců neovlivnila souběžné testy admina.
test.use({ storageState: storageStatePath("partner") });

async function createTask(page: Page, title: string) {
  await page.goto("/tasks");
  const form = page.locator("#new-task");
  await form.getByLabel("Název úkolu").fill(title);
  await form.getByRole("button", { name: "Vytvořit úkol" }).click();
  await expect(page).toHaveURL(/\/tasks\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

test("změna zobrazených sloupců se projeví hned, bez obnovení stránky", async ({
  page,
}) => {
  await page.goto("/projects");
  const panel = page.getByTestId("column-visibility-panel");
  const trigger = panel.getByRole("button", { name: /Sloupce/ });
  const dialog = page.getByRole("dialog", { name: "Zobrazené sloupce" });

  // Výchozí stav (sloupec „Poznámka“ je defaultně skrytý).
  await trigger.click();
  await dialog.getByRole("button", { name: "Obnovit výchozí" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("columnheader", { name: "Poznámka", exact: true }),
  ).toHaveCount(0);

  await trigger.click();
  await dialog.getByRole("checkbox", { name: "Poznámka", exact: true }).check();
  await dialog.getByRole("button", { name: "Uložit sloupce" }).click();

  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("columnheader", { name: "Poznámka", exact: true }),
  ).toBeVisible({ timeout: 5_000 });

  // Úklid: zpět na výchozí sloupce.
  await trigger.click();
  await dialog.getByRole("button", { name: "Obnovit výchozí" }).click();
  await expect(
    page.getByRole("columnheader", { name: "Poznámka", exact: true }),
  ).toHaveCount(0);
});

test("odesílací tlačítko je během ukládání zablokované a pak se znovu povolí", async ({
  page,
}) => {
  const title = e2eName("pending");
  await createTask(page, title);

  // Zpomal server action (POST na detail úkolu), ať je pending stav vidět.
  await page.route(/\/tasks\/[a-z0-9]+$/, async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });

  const comment = `${title}-komentar`;
  const form = page.locator("form").filter({ has: page.getByLabel("Nový komentář") });
  await form.getByLabel("Nový komentář").fill(comment);
  const submit = form.locator('button[type="submit"]');
  await submit.click();

  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute("aria-busy", "true");

  await expect(page.getByText(comment)).toBeVisible();
  await expect(submit).toBeEnabled();
  await expect(submit).not.toHaveAttribute("aria-busy", "true");
  await expectNoErrorPage(page);
});

test("navigace mezi moduly doběhne bez čekání na obnovení", async ({ page }) => {
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Hlavní navigace" });

  for (const [label, heading] of [
    ["Subjekty", "Subjekty"],
    ["Úkoly", "Úkoly"],
    ["Výkazy práce", "Výkazy práce"],
  ] as const) {
    const started = Date.now();
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
    // Volná pojistka, ne výkonnostní test: dřív navigace stála ~850 ms
    // a obnovení po akci zamrzlo úplně.
    expect(Date.now() - started).toBeLessThan(2_000);
  }
});
