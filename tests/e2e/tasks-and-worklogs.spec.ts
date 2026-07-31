import { expect, test, type Page } from "@playwright/test";

import {
  e2eName,
  expectNoErrorPage,
  submitAndAwaitAction,
} from "./support/helpers";

/** Založí úkol přes formulář „Nový úkol“; akce přesměruje na jeho detail. */
async function createTask(page: Page, title: string) {
  await page.goto("/tasks");
  const form = page.locator("#new-task");
  await form.getByLabel("Název úkolu").fill(title);
  await form.getByLabel("Priorita").selectOption("HIGH");
  await form.getByRole("button", { name: "Vytvořit úkol" }).click();
  await expect(page).toHaveURL(/\/tasks\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

test.describe("úkoly", () => {
  test("nový úkol se vytvoří a otevře jeho detail", async ({ page }) => {
    const title = e2eName("ukol");
    await createTask(page, title);

    await expect(page.getByText("Vytvořeno").first()).toBeVisible();
    await expect(page.getByText("Vysoká").first()).toBeVisible();
  });

  test("nový úkol se objeví v seznamu úkolů", async ({ page }) => {
    const title = e2eName("vseznamu");
    await createTask(page, title);

    await page.goto("/tasks");
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("Vysoká")).toBeVisible();
  });

  test("prázdný název úkolu neprojde HTML validací", async ({ page }) => {
    await page.goto("/tasks");
    const form = page.locator("#new-task");
    await form.getByRole("button", { name: "Vytvořit úkol" }).click();

    await expect(page).toHaveURL(/\/tasks$/);
    const valid = await form
      .getByLabel("Název úkolu")
      .evaluate((input: HTMLInputElement) => input.checkValidity());
    expect(valid).toBe(false);
  });

  // POZOR: updateTaskStatus stránku sám neobnoví (viz tests/e2e/README.md,
  // sekce Známá omezení), proto je v testu explicitní reload. Aserce
  // tím neslábne — ověřuje se uložený stav i vykreslená historie změn.
  test("změna statusu úkolu se uloží a je vidět v historii", async ({ page }) => {
    const title = e2eName("status");
    await createTask(page, title);
    const detailUrl = page.url();

    await page.getByLabel("Nový status").selectOption("IN_PROGRESS");
    await page.getByLabel("Komentář ke změně").fill("e2e-prechod-do-prace");
    await submitAndAwaitAction(
      page,
      page.getByRole("button", { name: "Uložit status" }),
    );
    await expectNoErrorPage(page);

    await page.goto(detailUrl);
    // Řádek historie nese původní i nový status a komentář ke změně.
    const historyRow = page
      .getByRole("row")
      .filter({ hasText: "e2e-prechod-do-prace" })
      .first();
    await expect(historyRow).toBeVisible();
    await expect(historyRow.getByText("Vytvořeno")).toBeVisible();
    await expect(historyRow.getByText("Rozpracováno")).toBeVisible();
    await expect(
      page.getByText("Úkol zatím nemá historii změn statusu."),
    ).toHaveCount(0);
  });

  test("nový úkol se objeví v seznamu i po filtrování podle statusu", async ({
    page,
  }) => {
    const title = e2eName("filtr");
    await createTask(page, title);

    await page.goto("/tasks");
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("CREATED");
    await page.getByRole("button", { name: "Filtrovat" }).click();

    await expect(page).toHaveURL(/status=CREATED/);
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  test("filtr na status bez shody vrátí prázdný seznam", async ({ page }) => {
    await page.goto("/tasks?status=DONE");

    await expect(
      page.getByRole("link", { name: "Připravit vyjádření k žalobě" }),
    ).toHaveCount(0);
    await expectNoErrorPage(page);
  });

  // Stejné omezení jako u změny statusu — proto reload před asercí.
  test("komentář k úkolu se uloží a zobrazí na detailu", async ({ page }) => {
    const title = e2eName("komentar");
    await createTask(page, title);
    const detailUrl = page.url();

    const comment = `${title}-komentar`;
    await page.getByLabel("Nový komentář").fill(comment);
    await submitAndAwaitAction(
      page,
      page.getByRole("button", { name: "Přidat komentář" }),
    );
    await expectNoErrorPage(page);

    await page.goto(detailUrl);
    await expect(page.getByText(comment)).toBeVisible();
  });

  test("detail neexistujícího úkolu vrátí 404", async ({ page }) => {
    await page.goto("/tasks/neexistujici-id");

    await expect(
      page.getByRole("heading", { name: "Tuto stránku jsme nenašli" }),
    ).toBeVisible();
  });
});

test.describe("výkazy práce", () => {
  test("nový výkaz práce se uloží a objeví v seznamu", async ({ page }) => {
    const description = e2eName("vykaz");
    await page.goto("/work-logs");

    // Sloupec „Popis“ je defaultně skrytý — bez jeho zapnutí by uložený text
    // nebyl v seznamu vidět.
    const columns = page.getByTestId("column-visibility-panel");
    await columns.getByText("Sloupce", { exact: true }).click(); // <details> je potřeba rozbalit
    await columns.getByRole("checkbox", { name: "Popis", exact: true }).check();
    await columns.getByRole("button", { name: "Uložit sloupce" }).click();
    await expect(page.getByRole("columnheader", { name: "Popis" })).toBeVisible();

    const form = page.locator("#new-work-log");
    await form.getByLabel("Datum práce").fill("2026-07-15");
    await form.getByLabel("Hodiny").fill("1.5");
    await form.getByLabel("Popis práce").fill(description);
    await submitAndAwaitAction(
      page,
      form.getByRole("button", { name: "Vytvořit výkaz" }),
    );
    await expect(page).toHaveURL(/\/work-logs/);
    await expectNoErrorPage(page);

    // createWorkLog přesměruje na /work-logs, tedy na stejnou URL — Next takový
    // redirect zahodí a seznam se sám neobnoví (tests/e2e/README.md).
    await page.reload();
    await expect(
      page.getByRole("row").filter({ hasText: description }),
    ).toHaveCount(1);
  });

  test("filtr podle data zúží seznam výkazů", async ({ page }) => {
    await page.goto("/work-logs");
    await page.getByLabel("Datum od").fill("2030-01-01");
    await page.getByLabel("Datum do").fill("2030-12-31");
    await page.getByRole("button", { name: "Filtrovat" }).click();

    await expect(page).toHaveURL(/dateFrom=2030-01-01/);
    await expect(
      page.getByText("Zatím nejsou založené žádné výkazy práce."),
    ).toBeVisible();
  });

  test("filtr podle pracovníka projde bez chyby", async ({ page }) => {
    await page.goto("/work-logs");
    await page
      .getByRole("combobox", { name: "Pracovník" })
      .selectOption({ label: "Admin Demo" });
    await page.getByRole("button", { name: "Filtrovat" }).click();

    await expect(page).toHaveURL(/userId=/);
    await expectNoErrorPage(page);
  });

  test("timesheet respektuje zvolené období", async ({ page }) => {
    await page.goto("/work-logs/timesheet");
    await page.getByLabel("Datum od").fill("2030-01-01");
    await page.getByLabel("Datum do").fill("2030-12-31");
    await page.getByRole("button", { name: "Použít nastavení" }).click();

    await expect(page).toHaveURL(/dateFrom=2030-01-01/);
    await expect(page.getByText(/1\. 1\. 2030|01\. 01\. 2030/).first()).toBeVisible();
  });
});

test.describe("reporty", () => {
  test("report hodin reaguje na filtr období", async ({ page }) => {
    await page.goto("/reports/hours");
    await page.getByLabel("Datum od").fill("2030-01-01");
    await page.getByLabel("Datum do").fill("2030-12-31");
    await page.getByRole("button", { name: /Filtrovat|Použít/ }).click();

    await expect(page).toHaveURL(/dateFrom=2030-01-01/);
    await expectNoErrorPage(page);
  });

  test("report podle klientů se vykreslí s tabulkou", async ({ page }) => {
    await page.goto("/reports/by-client");

    await expect(
      page.getByRole("columnheader", { name: "Klient" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Hodiny" }),
    ).toBeVisible();
  });
});
