import { expect, test, type Page } from "@playwright/test";

import { appAlert, e2eName, expectNoErrorPage } from "./support/helpers";

/** Vyplní a odešle formulář „Nový subjekt“ na /subjects. */
async function createSubject(
  page: Page,
  values: { name: string; ico?: string; address?: string },
) {
  const form = page.locator("#new-subject");
  await form.getByLabel("Název").fill(values.name);
  if (values.ico) await form.getByLabel("IČO").fill(values.ico);
  if (values.address) await form.getByLabel("Adresa").fill(values.address);
  await form.getByRole("button", { name: "Vytvořit subjekt" }).click();
}

/** IČO, které v seedu ani v jiném testu neexistuje. */
function uniqueIco() {
  return String(50_000_000 + Math.floor(Math.random() * 40_000_000));
}

test.describe("subjekty — hledání a filtrování", () => {
  test("vyhledání subjektu podle názvu zúží seznam", async ({ page }) => {
    await page.goto("/subjects");
    await page.getByPlaceholder("Název nebo IČO").fill("ABC");
    await page.getByRole("button", { name: "Hledat", exact: true }).click();

    await expect(page).toHaveURL(/q=ABC/);
    const table = page.getByRole("table");
    await expect(table.getByRole("link", { name: "ABC s.r.o." })).toBeVisible();
    await expect(table.getByRole("link", { name: "XYZ s.r.o." })).toHaveCount(0);
  });

  test("hledání podle IČO najde konkrétní subjekt", async ({ page }) => {
    await page.goto("/subjects");
    await page.getByPlaceholder("Název nebo IČO").fill("87654321");
    await page.getByRole("button", { name: "Hledat", exact: true }).click();

    await expect(
      page.getByRole("table").getByRole("link", { name: "XYZ s.r.o." }),
    ).toBeVisible();
  });

  test("hledání bez výsledků ukáže prázdný stav", async ({ page }) => {
    await page.goto("/subjects");
    await page
      .getByPlaceholder("Název nebo IČO")
      .fill("rozhodne-neexistujici-subjekt-xyz");
    await page.getByRole("button", { name: "Hledat", exact: true }).click();

    await expect(
      page.getByText("Žádné subjekty neodpovídají zadání."),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("reset hledání vrátí plný seznam", async ({ page }) => {
    await page.goto("/subjects?q=ABC");
    await expect(
      page.getByRole("table").getByRole("link", { name: "XYZ s.r.o." }),
    ).toHaveCount(0);

    await page.getByPlaceholder("Název nebo IČO").fill("");
    await page.getByRole("button", { name: "Hledat", exact: true }).click();

    await expect(
      page.getByRole("table").getByRole("link", { name: "XYZ s.r.o." }),
    ).toBeVisible();
    await expect(
      page.getByRole("table").getByRole("link", { name: "ABC s.r.o." }),
    ).toBeVisible();
  });

  test("filtr Archiv změní zobrazenou množinu", async ({ page }) => {
    await page.goto("/subjects");
    await page.getByLabel("Archiv").selectOption("archived");
    await page.getByRole("button", { name: "Hledat", exact: true }).click();

    await expect(page).toHaveURL(/archive=archived/);
    // V seedu nejsou archivované subjekty → prázdný stav.
    await expect(
      page.getByText("Žádné subjekty neodpovídají zadání."),
    ).toBeVisible();
  });
});

test.describe("subjekty — vytvoření", () => {
  test("nový subjekt se vytvoří a otevře jeho detail", async ({ page }) => {
    const name = e2eName("subjekt");
    await page.goto("/subjects");
    await createSubject(page, { name, ico: uniqueIco(), address: "Praha 1" });

    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByText("Praha 1").first()).toBeVisible();
  });

  test("vytvořený subjekt je dohledatelný v seznamu", async ({ page }) => {
    const name = e2eName("hledatelny");
    await page.goto("/subjects");
    await createSubject(page, { name, ico: uniqueIco() });
    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);

    await page.goto("/subjects");
    await page.getByPlaceholder("Název nebo IČO").fill(name);
    await page.getByRole("button", { name: "Hledat", exact: true }).click();

    await expect(page.getByRole("table").getByRole("link", { name })).toBeVisible();
  });

  test("prázdný název formulář neodešle (HTML validace)", async ({ page }) => {
    await page.goto("/subjects");
    const form = page.locator("#new-subject");
    await form.getByLabel("IČO").fill(uniqueIco());
    await form.getByRole("button", { name: "Vytvořit subjekt" }).click();

    await expect(page).toHaveURL(/\/subjects$/);
    const valid = await form
      .getByLabel("Název")
      .evaluate((input: HTMLInputElement) => input.checkValidity());
    expect(valid).toBe(false);
  });

  test("české znaky a diakritika se uloží beze změny", async ({ page }) => {
    const name = `${e2eName("Přeučený")} Žluťoučký Kůň & spol., s.r.o.`;
    await page.goto("/subjects");
    await createSubject(page, { name, ico: uniqueIco() });

    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  });

  test("velmi dlouhý název nerozbije layout detailu", async ({ page }) => {
    const name = `${e2eName("dlouhy")}-${"Přílišžluťoučkýkůň".repeat(12)}`;
    await page.goto("/subjects");
    await createSubject(page, { name, ico: uniqueIco() });

    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test("duplicitní IČO zobrazí srozumitelnou hlášku, ne chybovou stránku", async ({
    page,
  }) => {
    const ico = uniqueIco();
    await page.goto("/subjects");
    await createSubject(page, { name: e2eName("original"), ico });
    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);

    await page.goto("/subjects");
    await createSubject(page, { name: e2eName("duplikat"), ico });

    await expect(page).toHaveURL(/\/subjects\?error=ico/);
    await expect(appAlert(page)).toHaveText(
      "Subjekt s tímto IČO už ve vaší kanceláři existuje.",
    );
    await expectNoErrorPage(page);
  });
});

test.describe("subjekty — detail a úprava", () => {
  test("úprava subjektu se projeví na detailu", async ({ page }) => {
    const name = e2eName("k-uprave");
    await page.goto("/subjects");
    await createSubject(page, { name, ico: uniqueIco() });
    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);

    await page.getByRole("link", { name: "Upravit subjekt" }).click();
    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+\/edit$/);

    const renamed = `${name}-upraveno`;
    await page.getByLabel("Název").fill(renamed);
    await page.getByRole("button", { name: /Uložit/ }).click();

    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: renamed, level: 1 })).toBeVisible();
  });

  test("detail neexistujícího subjektu ukáže 404, ne chybovou stránku", async ({
    page,
  }) => {
    await page.goto("/subjects/tento-subjekt-neexistuje");

    await expect(
      page.getByRole("heading", { name: "Tuto stránku jsme nenašli" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Něco se pokazilo" }),
    ).toHaveCount(0);
  });
});
