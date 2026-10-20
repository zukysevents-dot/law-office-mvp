import { expect, test, type Page } from "@playwright/test";

import {
  e2eName,
  expectNoErrorPage,
  submitAndAwaitAction,
} from "./support/helpers";

/** Zapne sloupec „Popis“ ve výkazech práce, pokud je skrytý (dialog Sloupce). */
async function ensureWorkLogDescriptionColumn(page: Page) {
  if ((await page.getByRole("columnheader", { name: "Popis" }).count()) > 0) {
    return;
  }
  await page
    .getByTestId("column-visibility-panel")
    .getByRole("button", { name: /Sloupce/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Zobrazené sloupce" });
  await dialog.getByRole("checkbox", { name: "Popis", exact: true }).check();
  await dialog.getByRole("button", { name: "Uložit sloupce" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("columnheader", { name: "Popis" })).toBeVisible();
}

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

  // Bez reloadu: server action s revalidatePath() musí stránku překreslit hned
  // (dřív to blokoval route-level loading.tsx, viz tests/e2e/README.md).
  test("změna statusu úkolu se uloží a je hned vidět v historii", async ({ page }) => {
    const title = e2eName("status");
    await createTask(page, title);

    await page.getByLabel("Nový status").selectOption("IN_PROGRESS");
    await page.getByLabel("Komentář ke změně").fill("e2e-prechod-do-prace");
    await submitAndAwaitAction(
      page,
      page.getByRole("button", { name: "Uložit status" }),
    );
    await expectNoErrorPage(page);

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

  // Dřív test používal ?status=DONE – taková hodnota v TaskStatus neexistuje,
  // filtr se tiše ignoroval a výsledek závisel jen na stránkování seznamu.
  test("filtr na status vyřadí úkoly v jiném stavu", async ({ page }) => {
    await page.goto("/tasks?status=COMPLETED");
    await expect(
      page.getByRole("combobox", { name: "Status", exact: true }),
    ).toHaveValue("COMPLETED");

    await expect(
      page.getByRole("link", { name: "Připravit vyjádření k žalobě" }),
    ).toHaveCount(0);
    await expectNoErrorPage(page);
  });

  test("komentář k úkolu se uloží a hned zobrazí na detailu", async ({ page }) => {
    const title = e2eName("komentar");
    await createTask(page, title);

    const comment = `${title}-komentar`;
    await page.getByLabel("Nový komentář").fill(comment);
    await submitAndAwaitAction(
      page,
      page.getByRole("button", { name: "Přidat komentář" }),
    );
    await expectNoErrorPage(page);

    await expect(page.getByText(comment)).toBeVisible();
    await expect(page.getByLabel("Nový komentář")).toHaveValue("");
  });

  test("detail neexistujícího úkolu vrátí 404", async ({ page }) => {
    await page.goto("/tasks/neexistujici-id");

    await expect(
      page.getByRole("heading", { name: "Tuto stránku jsme nenašli" }),
    ).toBeVisible();
  });
});

test.describe("výkazy práce", () => {
  test("nový výkaz práce se uloží a hned objeví v seznamu", async ({ page }) => {
    const description = e2eName("vykaz");
    await page.goto("/work-logs");

    // Sloupec „Popis“ je dnes výchozí, ale uživatel ho mohl skrýt – test na
    // stavu z předchozích běhů nezávisí: zapne ho jen tehdy, když chybí.
    await ensureWorkLogDescriptionColumn(page);

    await page.getByRole("link", { name: "Nový výkaz" }).click();
    const form = page.getByRole("dialog", { name: "Nový výkaz práce" });
    await expect(form).toBeVisible();
    await form.getByLabel("Datum práce").fill("2026-07-15");
    await form.getByLabel("Hodiny").fill("1.5");
    await form.getByLabel("Popis práce").fill(description);
    await submitAndAwaitAction(
      page,
      form.getByRole("button", { name: "Vytvořit výkaz" }),
    );
    await expect(page).toHaveURL(/\/work-logs$/);
    await expect(form).toBeHidden();
    await expectNoErrorPage(page);

    // Bez reloadu: nový řádek je vidět hned po uložení.
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
