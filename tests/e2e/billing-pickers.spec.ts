import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  e2eName,
  expectNoErrorPage,
  submitAndAwaitAction,
} from "./support/helpers";

// Seed: ABC s.r.o. (IČO 12345678) má projekt „Soudní spor ABC“ s případem
// „Žaloba na zaplacení“, XYZ s.r.o. (IČO 87654321) žádný projekt nemá.
const CASE_OPTION = "Žaloba na zaplacení / Soudní spor ABC";

async function selectByText(select: Locator, text: string) {
  const value = await select
    .locator("option", { hasText: text })
    .first()
    .getAttribute("value");
  expect(value, `option „${text}“`).toBeTruthy();
  await select.selectOption(value!);
}

function option(select: Locator, text: string) {
  return select.locator("option", { hasText: text });
}

/** Approved billable work log of ABC / Soudní spor ABC / Žaloba na zaplacení. */
async function createApprovedAbcWorkLog(page: Page, description: string) {
  await page.goto("/work-logs?new=1");
  const dialog = page.getByRole("dialog", { name: "Nový výkaz práce" });
  await expect(dialog).toBeVisible();
  // Výběr případu doplní projekt i subjekt.
  await selectByText(dialog.getByLabel("Případ"), "Žaloba na zaplacení");
  await expect(dialog.getByLabel("Subjekt")).not.toHaveValue("");
  await dialog.getByLabel("Datum práce").fill("2031-03-03");
  await dialog.getByLabel("Hodiny").fill("1");
  await dialog.getByLabel("Popis práce").fill(description);
  await submitAndAwaitAction(
    page,
    dialog.getByRole("button", { name: "Vytvořit výkaz" }),
  );
  await expect(dialog).toBeHidden();

  await page.goto(`/billing/approvals?q=${encodeURIComponent(description)}`);
  const card = page.getByTestId("approval-card");
  await expect(card).toHaveCount(1);
  await submitAndAwaitAction(page, card.getByRole("button", { name: "Schválit" }));
  await expect(page.getByTestId("approval-card")).toHaveCount(0);
}

test.describe("fakturace – klient → projekt → případ", () => {
  test("filtr fakturace nabízí jen projekty a případy zvoleného subjektu", async ({
    page,
  }) => {
    await page.goto("/billing");
    const subject = page.getByRole("combobox", { name: "Subjekt" });
    const project = page.getByRole("combobox", { name: "Projekt" });
    const legalCase = page.getByRole("combobox", { name: "Případ" });

    await selectByText(subject, "XYZ s.r.o.");
    await expect(option(project, "Soudní spor ABC")).toHaveCount(0);
    await expect(option(legalCase, CASE_OPTION)).toHaveCount(0);

    await selectByText(subject, "ABC s.r.o.");
    await expect(option(project, "Soudní spor ABC")).toHaveCount(1);
    await expect(option(legalCase, CASE_OPTION)).toHaveCount(1);

    // Výběr případu doplní projekt.
    await selectByText(legalCase, "Žaloba na zaplacení");
    await expect(project).not.toHaveValue("");

    // Změna subjektu vynuluje projekt i případ.
    await selectByText(subject, "XYZ s.r.o.");
    await expect(project).toHaveValue("");
    await expect(legalCase).toHaveValue("");

    await page.getByRole("button", { name: "Filtrovat" }).click();
    await expect(page).toHaveURL(/subjectId=/);
    await expectNoErrorPage(page);
  });

  test("nová faktura načte výkazy jen zvoleného projektu a případu", async ({
    page,
  }) => {
    const description = e2eName("fakt");
    await createApprovedAbcWorkLog(page, description);

    await page.goto("/billing/invoices/new");
    const subject = page.getByRole("combobox", {
      name: "Klient s nevyfakturovanými výkazy",
    });
    const project = page.getByRole("combobox", { name: "Projekt" });
    const legalCase = page.getByRole("combobox", { name: "Případ" });

    await selectByText(subject, "ABC s.r.o.");
    await selectByText(project, "Soudní spor ABC");
    await selectByText(legalCase, "Žaloba na zaplacení");
    await page.getByRole("button", { name: "Načíst výkazy" }).click();

    await expect(page).toHaveURL(/projectId=/);
    await expect(page).toHaveURL(/caseId=/);
    await expect(page.getByRole("row").filter({ hasText: description })).toHaveCount(1);
    // Výběr zůstane po načtení zachovaný.
    await expect(project).not.toHaveValue("");
    await expect(legalCase).not.toHaveValue("");
  });

  test("cizí projekt v URL nové faktury se ignoruje", async ({ page }) => {
    await createApprovedAbcWorkLog(page, e2eName("faktcizi"));
    await page.goto("/billing/invoices/new");
    const subject = page.getByRole("combobox", {
      name: "Klient s nevyfakturovanými výkazy",
    });
    const abcValue = await option(subject, "ABC s.r.o.").first().getAttribute("value");
    expect(abcValue).toBeTruthy();
    await page.goto(
      `/billing/invoices/new?subjectId=${abcValue}&projectId=neexistujici&caseId=neexistujici`,
    );
    await expectNoErrorPage(page);
    await expect(page.getByRole("combobox", { name: "Projekt" })).toHaveValue("");
    await expect(page.getByRole("combobox", { name: "Případ" })).toHaveValue("");
  });

  test("nový paušál nabízí jen projekty zvoleného klienta", async ({ page }) => {
    await page.goto("/billing/retainers");
    const subject = page.getByRole("combobox", { name: "Klient" });
    const project = page.getByRole("combobox", { name: "Projekt (volitelné)" });

    await selectByText(subject, "XYZ s.r.o.");
    await expect(project.locator("option")).toHaveCount(1);
    await expect(project.locator("option")).toHaveText("Celý klient");

    await selectByText(subject, "ABC s.r.o.");
    await expect(option(project, "Soudní spor ABC")).toHaveCount(1);
  });

  test("úprava výkazu: změna subjektu vynuluje projekt i případ", async ({ page }) => {
    const description = e2eName("editkask");
    await page.goto("/work-logs?new=1");
    const dialog = page.getByRole("dialog", { name: "Nový výkaz práce" });
    await selectByText(dialog.getByLabel("Případ"), "Žaloba na zaplacení");
    await dialog.getByLabel("Datum práce").fill("2026-07-20");
    await dialog.getByLabel("Hodiny").fill("1");
    await dialog.getByLabel("Popis práce").fill(description);
    await submitAndAwaitAction(
      page,
      dialog.getByRole("button", { name: "Vytvořit výkaz" }),
    );
    await expect(dialog).toBeHidden();

    await page
      .getByRole("row")
      .filter({ hasText: description })
      .getByRole("link", { name: "Upravit" })
      .click();
    await expect(page).toHaveURL(/\/work-logs\/[^/]+\/edit$/);
    const project = page.getByRole("combobox", { name: "Projekt" });
    const legalCase = page.getByRole("combobox", { name: "Případ" });
    await expect(project).not.toHaveValue("");
    await expect(legalCase).not.toHaveValue("");

    await selectByText(page.getByRole("combobox", { name: "Subjekt" }), "XYZ s.r.o.");
    await expect(project).toHaveValue("");
    await expect(legalCase).toHaveValue("");
    await expect(option(project, "Soudní spor ABC")).toHaveCount(0);
  });
});
