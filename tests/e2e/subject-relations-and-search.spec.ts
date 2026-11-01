import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "./support/e2e-env";
import {
  e2eName,
  expectNoErrorPage,
  pickerOptionTexts,
  pickerValue,
  pickOption,
  submitAndAwaitAction,
} from "./support/helpers";

// Testování 19. 10. (balík 03): vazby subjektů na projektu a případu jde
// upravit i odebrat, výběry hledají fulltextově (kdekoli v názvu, bez ohledu
// na velikost písmen a diakritiku). Seed: ABC s.r.o. (IČO 12345678) s projektem
// „Soudní spor ABC“ a případem „Žaloba na zaplacení“, XYZ s.r.o. (87654321).

const ABC = "ABC s.r.o., IČO 12345678";
const XYZ = "XYZ s.r.o., IČO 87654321";

async function auditActions(entityId: string) {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    const result = await db.query<{ action: string }>(
      `select action from "auditLogs" where "entityType" = 'SubjectRelation' and "entityId" = $1 order by "createdAt"`,
      [entityId],
    );
    return result.rows.map((row) => row.action);
  } finally {
    await db.end();
  }
}

async function createProject(page: Page, name: string) {
  await page.goto("/projects");
  const form = page.locator("#new-project");
  await form.getByLabel("Název projektu").fill(name);
  await pickOption(form.getByRole("combobox", { name: "Klient", exact: true }), "ABC");
  await form.getByRole("button", { name: "Vytvořit projekt" }).click();
  await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);
  return new URL(page.url()).pathname;
}

test.describe("fulltextové hledání ve výběrech", () => {
  test("klient nového projektu: hledá kdekoli v názvu, bez velikosti písmen", async ({
    page,
  }) => {
    await page.goto("/projects");
    const form = page.locator("#new-project");
    const client = form.getByRole("combobox", { name: "Klient", exact: true });

    // Druhé slovo názvu („s.r.o.“) — nativní select hledal jen od začátku.
    await client.fill("s.R.o");
    const list = page.getByRole("listbox");
    await expect(list.getByRole("option", { name: ABC })).toBeVisible();
    await expect(list.getByRole("option", { name: XYZ })).toBeVisible();

    // IČO je součástí textu položky.
    await client.fill("87654");
    await expect(list.getByRole("option", { name: XYZ })).toBeVisible();
    await expect(list.getByRole("option", { name: ABC })).toHaveCount(0);

    await client.fill("neexistujici-subjekt");
    await expect(list.getByText("Nic nenalezeno.")).toBeVisible();

    // Klávesnice: Enter vybere zvýrazněnou shodu, formulář neodešle.
    await client.fill("xyz");
    await client.press("Enter");
    await expect(list).toBeHidden();
    await expect(client).toHaveValue(XYZ);
    await expect(pickerValue(client)).not.toHaveValue("");
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("případ ve výkazu: bez diakritiky a podle slova uprostřed", async ({ page }) => {
    await page.goto("/work-logs?new=1");
    const dialog = page.getByRole("dialog", { name: "Nový výkaz práce" });
    await expect(dialog).toBeVisible();
    const legalCase = dialog.getByRole("combobox", { name: "Případ", exact: true });

    // „zaplaceni“ = třetí slovo názvu „Žaloba na zaplacení“, bez diakritiky.
    await pickOption(legalCase, "zaplaceni", { option: "Žaloba na zaplacení" });
    await expect(legalCase).toHaveValue(/Žaloba na zaplacení/);
    // Kaskáda doplnila projekt i subjekt.
    await expect(dialog.getByRole("combobox", { name: "Projekt", exact: true })).toHaveValue(
      "Soudní spor ABC",
    );
    await expect(dialog.getByRole("combobox", { name: "Subjekt", exact: true })).toHaveValue(
      ABC,
    );

    // Esc zavře jen seznam, ne dialog.
    await legalCase.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await legalCase.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(dialog).toBeVisible();

    // Prázdná volba zůstává první a výběr vynuluje.
    const texts = await pickerOptionTexts(legalCase);
    expect(texts[0]).toBe("Bez případu");
  });
});

test.describe("vazby subjektů", () => {
  test("na projektu jde vazbu přidat, upravit i odebrat; hlavní klient zůstává", async ({
    page,
  }) => {
    const projectName = e2eName("vazby");
    const path = await createProject(page, projectName);
    const section = page.locator("section", { hasText: "Subjektové vazby projektu" }).first();

    // Automatická vazba „Klient = hlavní subjekt“ jde upravit, ne odebrat.
    const mainRow = section.getByRole("row").filter({ hasText: "ABC s.r.o." });
    await expect(mainRow.getByRole("button", { name: /Upravit/ })).toBeVisible();
    await expect(mainRow.getByRole("button", { name: /Odebrat/ })).toHaveCount(0);

    // Přidání vazby (výběr s hledáním).
    const addForm = page.locator("form", { hasText: "Přidat vazbu" });
    await pickOption(addForm.getByRole("combobox", { name: "Subjekt", exact: true }), "xyz");
    await addForm.getByLabel("Role subjektu").selectOption("COUNTERPARTY");
    await addForm.getByLabel("Poznámka").fill("protistrana sporu");
    await submitAndAwaitAction(page, addForm.getByRole("button", { name: "Přidat vazbu" }));
    const row = section.getByRole("row").filter({ hasText: "XYZ s.r.o." });
    await expect(row).toContainText("Protistrana");
    await expect(row).toContainText("protistrana sporu");
    // Po přidání se výběr subjektu vyprázdní (reset formuláře).
    await expect(addForm.getByRole("combobox", { name: "Subjekt", exact: true })).toHaveValue("");

    // Úprava role a poznámky.
    await row.getByRole("button", { name: /Upravit/ }).click();
    const dialog = page.getByRole("dialog", { name: "Upravit vazbu subjektu" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Role subjektu").selectOption("WITNESS");
    await dialog.getByLabel("Poznámka").fill("svědek jednání");
    await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Uložit" }));
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Svědek");
    await expect(row).toContainText("svědek jednání");

    const relationId = await page.evaluate(() => {
      const input = [...document.querySelectorAll<HTMLInputElement>('input[name="relationId"]')]
        .find((element) => element.closest("tr")?.textContent?.includes("XYZ s.r.o."));
      return input?.value ?? "";
    });
    expect(relationId).toBeTruthy();

    // Odebrání s potvrzením.
    await row.getByRole("button", { name: /Odebrat/ }).click();
    const confirm = page.getByRole("dialog", { name: "Odebrat vazbu subjektu" });
    await submitAndAwaitAction(page, confirm.getByRole("button", { name: "Odebrat vazbu" }));
    await expect(section.getByRole("row").filter({ hasText: "XYZ s.r.o." })).toHaveCount(0);
    await expect(mainRow).toBeVisible();

    expect(await auditActions(relationId)).toEqual(["UPDATE", "DELETE"]);
    await page.goto(path);
    await expectNoErrorPage(page);
  });

  test("na případu jde vazbu upravit i odebrat", async ({ page }) => {
    await page.goto("/cases");
    await page.getByRole("link", { name: "Žaloba na zaplacení" }).first().click();
    await expect(page).toHaveURL(/\/cases\/[a-z0-9]+$/);

    const note = e2eName("pozn");
    const addForm = page.locator("form", { hasText: "Přidat vazbu" });
    await pickOption(addForm.getByRole("combobox", { name: "Subjekt", exact: true }), "XYZ");
    await addForm.getByLabel("Role subjektu").selectOption("OTHER");
    await addForm.getByLabel("Poznámka").fill(note);
    await submitAndAwaitAction(page, addForm.getByRole("button", { name: "Přidat vazbu" }));

    const row = page.getByRole("row").filter({ hasText: note });
    await expect(row).toContainText("Jiné");
    await row.getByRole("button", { name: /Upravit/ }).click();
    const dialog = page.getByRole("dialog", { name: "Upravit vazbu subjektu" });
    await dialog.getByLabel("Role subjektu").selectOption("REPRESENTATIVE");
    await submitAndAwaitAction(page, dialog.getByRole("button", { name: "Uložit" }));
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Zástupce");

    await row.getByRole("button", { name: /Odebrat/ }).click();
    const confirm = page.getByRole("dialog", { name: "Odebrat vazbu subjektu" });
    await submitAndAwaitAction(page, confirm.getByRole("button", { name: "Odebrat vazbu" }));
    await expect(page.getByRole("row").filter({ hasText: note })).toHaveCount(0);
  });
});
