import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL, type RoleKey } from "./support/e2e-env";
import {
  e2eName,
  expectNoErrorPage,
  openCommandPalette,
  pageAs,
  submitAndAwaitAction,
} from "./support/helpers";

// Přidá osobu do řešitelů / dohledu na formuláři úkolu (TaskPeopleFields).
// Opakuje výběr, dokud React nepřevezme hodnotu (tlačítko je do té doby
// neaktivní).
async function addTaskPerson(
  form: Locator,
  picker: "Přidat řešitele nebo tým" | "Přidat osobu s dohledem",
  name: string,
) {
  const select = form.getByRole("combobox", { name: picker });
  const button = form.getByRole("button", {
    name: picker === "Přidat řešitele nebo tým" ? "Přidat řešitele" : "Přidat dohled",
    exact: true,
  });
  await expect(async () => {
    await select.selectOption({ label: name });
    await expect(button).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await button.click();
  await expect(
    form.getByRole("button", {
      name:
        picker === "Přidat řešitele nebo tým"
          ? `Odebrat řešitele ${name}`
          : `Odebrat dohled ${name}`,
    }),
  ).toBeVisible();
}

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
    await expect(nav.getByRole("link", { name: "Týmy a řešitelé" })).toBeVisible();
  });

  test("koncipient nevidí administrativní položky menu", async ({ browser }) => {
    const page = await pageAs(browser, "trainee");
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Hlavní navigace" });

    await expect(nav.getByRole("link", { name: "Audit log" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Kancelář" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "AML / KYC" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Fakturace" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Oprávnění" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Týmy a řešitelé" })).toHaveCount(0);
    // Běžné moduly zůstávají dostupné.
    await expect(nav.getByRole("link", { name: "Úkoly", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Projekty" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Případy" })).toBeVisible();
    await page.context().close();
  });

  test("administrátor otevře Oprávnění z menu; jeho sloupec je zamčený", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Hlavní navigace" });
    await nav.getByRole("link", { name: "Oprávnění" }).click();

    await expect(page).toHaveURL(/\/settings\/permissions$/);
    await expect(
      page.getByRole("heading", { name: "Oprávnění", level: 1 }),
    ).toBeVisible();
    const adminCell = page.getByRole("checkbox", {
      name: "Subjekty – Administrátor",
      exact: true,
    });
    await expect(adminCell).toBeChecked();
    await expect(adminCell).toBeDisabled();
    // Výchozí matice: praktikant vidí subjekty, sazby ne.
    await expect(
      page.getByRole("checkbox", { name: "Subjekty – Praktikant", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Vidí sazby a částky – Praktikant" }),
    ).not.toBeChecked();
    await expectNoErrorPage(page);
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
  { route: "/settings/permissions", roles: ["trainee", "lawyer"] },
  { route: "/settings/assignments", roles: ["trainee", "lawyer"] },
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

test.describe("výchozí viditelnost a reporty", () => {
  test("koncipient nevidí v reportu hodin sloupec Částka", async ({ browser }) => {
    const page = await pageAs(browser, "trainee");
    await page.goto("/reports/hours");

    await expect(
      page.getByRole("heading", { name: "Měsíční přehled hodin", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Hodiny" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Částka" })).toHaveCount(0);
    await page.context().close();
  });

  test("administrátor vidí v reportu hodin sloupec Částka", async ({ page }) => {
    await page.goto("/reports/hours");
    await expect(page.getByRole("columnheader", { name: "Částka" })).toBeVisible();
  });
});

// Zapne sloupec „Popis“, pokud je skrytý. Prázdný seznam (praktikant zatím
// nemá žádný výkaz) tabulku nevykreslí – pak není co zapínat.
async function ensureWorkLogDescriptionColumn(page: Page) {
  if ((await page.getByRole("columnheader", { name: "Popis" }).count()) > 0) {
    return;
  }
  if ((await page.getByRole("table").count()) === 0) {
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

// Všechny testy praktikanta v jednom sériovém bloku: utažení role Praktikant
// v matici by jinak ovlivnilo paralelně běžící testy téže role. Žádný jiný
// spec praktikantem nenaviguje (prepare-e2e-db navíc smaže zbylé výjimky).
test.describe("praktikant a matice oprávnění", () => {
  test.describe.configure({ mode: "serial" });

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

    // Subjekt vidí (i kontakty a statutáry), ale úpravu nedostane ani přímou URL.
    await page.getByRole("link", { name: "ABC s.r.o." }).first().click();
    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);
    await expect(
      page.locator("#kontaktni-udaje").getByRole("link", { name: "info@abc.example" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Upravit subjekt" })).toHaveCount(0);
    await page.goto(`${new URL(page.url()).pathname}/edit`);
    await expect(
      page.getByRole("heading", { name: "Tuto stránku jsme nenašli" }),
    ).toBeVisible();
    await page.context().close();
  });

  test("praktikant ve výchozím stavu vidí subjekty, projekty, případy i úkoly kanceláře", async ({
    browser,
  }) => {
    const page = await pageAs(browser, "intern");

    await page.goto("/subjects");
    await expect(page.getByRole("link", { name: "ABC s.r.o." }).first()).toBeVisible();
    await page.goto("/cases");
    await expect(
      page.getByRole("link", { name: "Žaloba na zaplacení" }).first(),
    ).toBeVisible();
    await page.goto("/tasks");
    await expect(
      page.getByRole("link", { name: "Připravit vyjádření k žalobě" }).first(),
    ).toBeVisible();

    await page.goto("/projects");
    await page.getByRole("link", { name: "Soudní spor ABC" }).first().click();
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);
    await expect(
      page.getByRole("heading", { name: "Soudní spor ABC", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Přístup odepřen")).toHaveCount(0);
    await expectNoErrorPage(page);
    // Sazby a částky zůstávají skryté.
    await expect(page.getByText("Hodinová sazba projektu")).toHaveCount(0);
    await page.context().close();
  });

  test("praktikant zapíše výkaz na úkol kolegy a výkaz je hned v seznamu", async ({
    browser,
  }) => {
    const page = await pageAs(browser, "intern");
    const description = e2eName("praktikant-vykaz");
    await page.goto("/work-logs");
    await ensureWorkLogDescriptionColumn(page);

    await page.getByRole("link", { name: "Nový výkaz" }).click();
    const form = page.getByRole("dialog", { name: "Nový výkaz práce" });
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Sazba")).toHaveCount(0);
    // Label obaluje i <option>, proto výběr přes roli a jméno, ne getByLabel.
    await form
      .getByRole("combobox", { name: "Subjekt", exact: true })
      .selectOption({ label: "ABC s.r.o., IČO 12345678" });
    await form
      .getByRole("combobox", { name: "Projekt", exact: true })
      .selectOption({ label: "Soudní spor ABC" });
    await form
      .getByRole("combobox", { name: "Případ", exact: true })
      .selectOption({ label: "Žaloba na zaplacení / Soudní spor ABC" });
    await form
      .getByRole("combobox", { name: "Úkol", exact: true })
      .selectOption({ label: "Připravit vyjádření k žalobě" });
    await form.getByLabel("Hodiny").fill("0.5");
    await form.getByLabel("Popis práce").fill(description);
    await submitAndAwaitAction(
      page,
      form.getByRole("button", { name: "Vytvořit výkaz" }),
    );

    await expect(form).toBeHidden();
    await expectNoErrorPage(page);
    await expect(page.getByText(/nemáte oprávnění/i)).toHaveCount(0);
    // Bez reloadu: seznam už má řádek (tabulka se vykreslí s prvním výkazem).
    await expect(page.getByRole("table").first()).toBeVisible();
    await ensureWorkLogDescriptionColumn(page);
    await expect(
      page.getByRole("row").filter({ hasText: description }),
    ).toHaveCount(1);
    await page.context().close();
  });

  test("utažení role Praktikant v matici platí hned a jde vrátit na výchozí", async ({
    page,
    browser,
  }) => {
    const intern = await pageAs(browser, "intern");
    try {
      await page.goto("/settings/permissions");
      await page
        .getByRole("combobox", { name: "Rozsah dat Úkoly – Praktikant" })
        .selectOption("ASSIGNED");
      await page
        .getByRole("checkbox", { name: "Projekty – Praktikant", exact: true })
        .uncheck();
      await submitAndAwaitAction(
        page,
        page.getByRole("button", { name: "Uložit oprávnění" }),
      );
      await expect(page.getByRole("status").filter({ hasText: "Oprávnění uložena." })).toBeVisible();
      // Bez reloadu: tabulka ukazuje uložený stav a značku změny.
      await expect(
        page.getByRole("checkbox", { name: "Projekty – Praktikant", exact: true }),
      ).not.toBeChecked();
      await expect(
        page.getByRole("combobox", { name: "Rozsah dat Úkoly – Praktikant" }),
      ).toHaveValue("ASSIGNED");
      await expect(page.getByText("upraveno, výchozí: Ano").first()).toBeAttached();

      // Praktikant: úkol kolegy zmizí, Projekty zmizí z menu, hledání i z URL.
      await intern.goto("/tasks");
      await expect(
        intern.getByRole("heading", { name: "Úkoly", level: 1 }),
      ).toBeVisible();
      await expect(
        intern.getByRole("link", { name: "Připravit vyjádření k žalobě" }),
      ).toHaveCount(0);
      const nav = intern.getByRole("navigation", { name: "Hlavní navigace" });
      await expect(nav.getByRole("link", { name: "Projekty" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Případy" })).toBeVisible();

      await intern.goto("/projects");
      await expectAccessDenied(intern);
      await expect(intern.getByText(/K modulu „Projekty“ nemáte oprávnění/)).toBeVisible();

      await intern.goto("/dashboard", { waitUntil: "networkidle" });
      const palette = await openCommandPalette(intern);
      await palette
        .getByPlaceholder("Hledat subjekt, projekt, případ, úkol…")
        .fill("Soudní spor");
      await expect(palette.getByRole("status")).toHaveText(/Nalezeno výsledků: \d+/);
      await expect(
        palette.getByRole("button", { name: /Soudní spor ABC/ }),
      ).toHaveCount(0);
    } finally {
      // Vrátit výchozí stav, aby další testy praktikanta nebyly ovlivněné.
      await page.goto("/settings/permissions");
      await page
        .getByRole("columnheader")
        .filter({ hasText: "Praktikant" })
        .getByRole("button", { name: "Obnovit výchozí" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Obnovit výchozí oprávnění" });
      await expect(dialog).toBeVisible();
      await submitAndAwaitAction(
        page,
        dialog.getByRole("button", { name: "Obnovit výchozí" }),
      );
      await expect(dialog).toBeHidden();
    }

    await expect(
      page.getByRole("status").filter({ hasText: "byla obnovena na výchozí" }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Projekty – Praktikant", exact: true }),
    ).toBeChecked();

    await intern.goto("/tasks");
    await expect(
      intern.getByRole("link", { name: "Připravit vyjádření k žalobě" }).first(),
    ).toBeVisible();
    await expect(
      intern
        .getByRole("navigation", { name: "Hlavní navigace" })
        .getByRole("link", { name: "Projekty" }),
    ).toBeVisible();
    await intern.context().close();
  });

  test("praktikant s rozsahem Přiřazené uvidí projekt až přes tým a ztratí ho po odchodu z týmu", async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const intern = await pageAs(browser, "intern");
    const projectName = e2eName("tymovy-projekt");
    const caseName = e2eName("tymovy-pripad");
    const taskTitle = e2eName("tymovy-ukol");
    const supervisedTaskTitle = e2eName("dohled-praktikant");
    const teamName = e2eName("tym-praktikant");
    const description = e2eName("tymovy-vykaz");
    const client = "Petr Dvořák – Truhlářství";
    const notFoundHeading = intern.getByRole("heading", {
      name: "Tuto stránku jsme nenašli",
    });

    try {
      // Admin: projekt (klient bez jiných vazeb na praktikanta), případ a
      // úkol kolegy.
      await page.goto("/projects");
      const projectForm = page.locator("#new-project");
      await projectForm.getByLabel("Název projektu").fill(projectName);
      await projectForm
        .getByRole("combobox", { name: "Klient", exact: true })
        .selectOption({ label: `${client}, IČO 76543218` });
      await projectForm.getByRole("button", { name: "Vytvořit projekt" }).click();
      await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);
      const projectPath = new URL(page.url()).pathname;
      const projectId = projectPath.split("/").pop() as string;

      await page.goto(`/cases?projectId=${projectId}`);
      const caseForm = page.locator("#new-case");
      await caseForm.getByLabel("Název případu").fill(caseName);
      await caseForm.getByRole("button", { name: "Vytvořit případ" }).click();
      await expect(page).toHaveURL(/\/cases\/[a-z0-9]+$/);
      const casePath = new URL(page.url()).pathname;

      await page.goto(`/tasks?projectId=${projectId}`);
      const taskForm = page.locator("#new-task");
      await taskForm.getByLabel("Název úkolu").fill(taskTitle);
      await addTaskPerson(taskForm, "Přidat řešitele nebo tým", "Advokát Demo");
      await taskForm.getByRole("button", { name: "Vytvořit úkol" }).click();
      await expect(page).toHaveURL(/\/tasks\/[a-z0-9]+$/);

      // Úkol mimo projekt, kde má praktikant jen dohled (audit balík 05).
      // Mimo projekt schválně: úkol s dohledem by mu jinak odkryl i projekt.
      await page.goto("/tasks");
      const supervisedForm = page.locator("#new-task");
      await supervisedForm.getByLabel("Název úkolu").fill(supervisedTaskTitle);
      await addTaskPerson(supervisedForm, "Přidat řešitele nebo tým", "Advokát Demo");
      await addTaskPerson(supervisedForm, "Přidat osobu s dohledem", "Praktikant Demo");
      await supervisedForm.getByRole("button", { name: "Vytvořit úkol" }).click();
      await expect(page).toHaveURL(/\/tasks\/[a-z0-9]+$/);
      const supervisedTaskPath = new URL(page.url()).pathname;

      // Matice: Praktikant vidí jen přiřazené subjekty, projekty, případy, úkoly.
      await page.goto("/settings/permissions");
      for (const entity of ["Subjekty", "Projekty", "Případy", "Úkoly"]) {
        await page
          .getByRole("combobox", { name: `Rozsah dat ${entity} – Praktikant` })
          .selectOption("ASSIGNED");
      }
      await submitAndAwaitAction(
        page,
        page.getByRole("button", { name: "Uložit oprávnění" }),
      );
      await expect(
        page.getByRole("status").filter({ hasText: "Oprávnění uložena." }),
      ).toBeVisible();

      // Bez přiřazení projekt nevidí — ani v seznamu, ani přímou URL.
      await intern.goto("/projects");
      await expect(
        intern.getByRole("heading", { name: "Projekty", level: 1 }),
      ).toBeVisible();
      await expect(intern.getByRole("link", { name: projectName })).toHaveCount(0);
      await intern.goto(projectPath);
      await expect(notFoundHeading).toBeVisible();

      // Dohled stačí: úkol s dohledem praktikant vidí v seznamu i přímou URL
      // (a smí měnit status), úkol kolegy na cizím projektu ne.
      await intern.goto("/tasks");
      await expect(
        intern.getByRole("link", { name: supervisedTaskTitle }),
      ).toBeVisible();
      await expect(intern.getByRole("link", { name: taskTitle })).toHaveCount(0);
      await intern.goto(supervisedTaskPath);
      await expect(
        intern.getByRole("heading", { name: supervisedTaskTitle, level: 1 }),
      ).toBeVisible();
      await expect(intern.getByLabel("Nový status")).toBeVisible();
      await expect(intern.getByRole("link", { name: "Upravit úkol" })).toHaveCount(0);

      // Admin: tým s praktikantem přiřazený k projektu na detailu.
      await page.goto("/settings/assignments");
      await page.getByLabel("Název týmu").fill(teamName);
      await submitAndAwaitAction(page, page.getByRole("button", { name: "Vytvořit tým" }));
      const card = page.getByRole("article", { name: teamName, exact: true });
      const addMember = async () => {
        await card
          .getByRole("combobox", { name: `Přidat člena do týmu ${teamName}` })
          .selectOption({ label: "Praktikant Demo" });
        await submitAndAwaitAction(
          page,
          card.getByRole("button", { name: "Přidat", exact: true }),
        );
        await expect(
          card.getByRole("button", { name: `Odebrat Praktikant Demo z týmu ${teamName}` }),
        ).toBeVisible();
      };
      await addMember();
      await page.goto(projectPath);
      await page
        .getByRole("combobox", { name: "Přidat řešitele nebo tým" })
        .selectOption({ label: `${teamName} (1 člen)` });
      await submitAndAwaitAction(
        page,
        page.getByRole("button", { name: "Přidat", exact: true }),
      );
      await expect(
        page.getByRole("button", { name: `Odebrat tým ${teamName}` }),
      ).toBeVisible();

      // Praktikant (bez ručního reloadu) projekt vidí: seznam, filtr „Já“,
      // detail, případ, úkol kolegy i klienta.
      await intern.goto("/projects");
      await expect(intern.getByRole("link", { name: projectName })).toBeVisible();
      await intern.goto("/projects?assignee=me");
      await expect(intern.getByRole("link", { name: projectName })).toBeVisible();
      await intern.getByRole("link", { name: projectName }).click();
      await expect(
        intern.getByRole("heading", { name: projectName, level: 1 }),
      ).toBeVisible();
      await expect(intern.getByRole("link", { name: caseName })).toBeVisible();
      await expect(intern.getByRole("link", { name: taskTitle })).toBeVisible();
      await expect(intern.getByRole("link", { name: client }).first()).toBeVisible();
      await intern.goto(casePath);
      await expect(
        intern.getByRole("heading", { name: caseName, level: 1 }),
      ).toBeVisible();
      await intern.goto("/subjects");
      await expect(intern.getByRole("link", { name: client }).first()).toBeVisible();

      // Odchod z týmu přístup hned odebere…
      await page.goto("/settings/assignments");
      await submitAndAwaitAction(
        page,
        card.getByRole("button", { name: `Odebrat Praktikant Demo z týmu ${teamName}` }),
      );
      await expect(
        card.getByRole("button", { name: `Odebrat Praktikant Demo z týmu ${teamName}` }),
      ).toHaveCount(0);
      await intern.goto(projectPath);
      await expect(notFoundHeading).toBeVisible();

      // …a návrat do týmu ho vrátí (dynamické členství).
      await addMember();
      await intern.goto(projectPath);
      await expect(
        intern.getByRole("heading", { name: projectName, level: 1 }),
      ).toBeVisible();

      // Teprve teď výkaz: vlastní výkaz je sám o sobě cesta „Přiřazené“.
      await intern.goto("/work-logs");
      await ensureWorkLogDescriptionColumn(intern);
      await intern.getByRole("link", { name: "Nový výkaz" }).click();
      const form = intern.getByRole("dialog", { name: "Nový výkaz práce" });
      await expect(form).toBeVisible();
      await form
        .getByRole("combobox", { name: "Subjekt", exact: true })
        .selectOption({ label: `${client}, IČO 76543218` });
      await form
        .getByRole("combobox", { name: "Projekt", exact: true })
        .selectOption({ label: projectName });
      await form.getByLabel("Hodiny").fill("0.5");
      await form.getByLabel("Popis práce").fill(description);
      await submitAndAwaitAction(
        intern,
        form.getByRole("button", { name: "Vytvořit výkaz" }),
      );
      await expect(form).toBeHidden();
      await expect(intern.getByText(/nemáte oprávnění/i)).toHaveCount(0);
      await ensureWorkLogDescriptionColumn(intern);
      await expect(
        intern.getByRole("row").filter({ hasText: description }),
      ).toHaveCount(1);
    } finally {
      // Výchozí matice Praktikanta a praktikant mimo e2e tým (jen E2E DB).
      const db = new Client({ connectionString: E2E_DATABASE_URL });
      await db.connect();
      try {
        await db.query(
          `DELETE FROM "rolePermissionOverrides" WHERE "role" = 'INTERN'`,
        );
        await db.query(
          `DELETE FROM "legalTeamMembers" WHERE "userId" =
             (SELECT "id" FROM "users" WHERE "email" = 'praktikant.demo@example.local')
             AND "legalTeamId" IN (SELECT "id" FROM "legalTeams" WHERE "name" LIKE 'e2e-%')`,
        );
        // Praktikant z dohledu e2e úkolů pryč (jinak by je dál viděl).
        await db.query(
          `DELETE FROM "taskAssignees" WHERE "userId" =
             (SELECT "id" FROM "users" WHERE "email" = 'praktikant.demo@example.local')
             AND "taskId" IN (SELECT "id" FROM "tasks" WHERE "title" LIKE 'e2e-%')`,
        );
      } finally {
        await db.end();
      }
      await intern.context().close();
    }
  });

  test("změny matice jsou v audit logu", async ({ page }) => {
    await page.goto("/audit-log");
    await page.getByLabel("Entita").selectOption({ label: "Oprávnění role" });
    await page.getByRole("button", { name: "Filtrovat" }).click();

    await expect(page).toHaveURL(/entityType=RolePermission/);
    await expect(
      page.getByRole("row").filter({ hasText: "Úprava" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Obnovení výchozích" }).first(),
    ).toBeVisible();
  });

  test("výjimka uživatele povolí praktikantovi sazby a jde zrušit", async ({
    page,
    browser,
  }) => {
    const intern = await pageAs(browser, "intern");
    await page.goto("/settings/permissions");
    await page
      .getByRole("link", { name: "Upravit výjimky – Praktikant Demo" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Oprávnění: Praktikant Demo", level: 1 }),
    ).toBeVisible();

    try {
      await page
        .getByRole("group", { name: "Vidí sazby a částky" })
        .getByLabel("Povolit")
        .check();
      await submitAndAwaitAction(
        page,
        page.getByRole("button", { name: "Uložit výjimky" }),
      );
      await expect(
        page.getByRole("status").filter({ hasText: "Výjimky uloženy." }),
      ).toBeVisible();

      await intern.goto("/subjects");
      await expect(
        intern.getByRole("columnheader", { name: "Hodinová sazba" }),
      ).toBeVisible();
    } finally {
      await page
        .getByRole("button", { name: "Zrušit všechny výjimky" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Zrušit všechny výjimky" });
      await submitAndAwaitAction(
        page,
        dialog.getByRole("button", { name: "Zrušit výjimky" }),
      );
      await expect(dialog).toBeHidden();
    }
    await expect(
      page.getByRole("group", { name: "Vidí sazby a částky" }).getByLabel(/Podle role/),
    ).toBeChecked();

    await intern.goto("/subjects");
    await expect(
      intern.getByRole("heading", { name: "Subjekty", level: 1 }),
    ).toBeVisible();
    await expect(
      intern.getByRole("columnheader", { name: "Hodinová sazba" }),
    ).toHaveCount(0);
    await intern.context().close();
  });
  test("praktikant se „Zakládá a upravuje subjekty“ sazby subjektu nevidí ani neuloží", async ({
    page,
    browser,
  }) => {
    const intern = await pageAs(browser, "intern");
    const name = e2eName("sazby-subjektu");
    await page.goto("/settings/permissions");
    await page
      .getByRole("link", { name: "Upravit výjimky – Praktikant Demo" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Oprávnění: Praktikant Demo", level: 1 }),
    ).toBeVisible();

    try {
      await page
        .getByRole("group", { name: "Zakládá a upravuje subjekty" })
        .getByLabel("Povolit")
        .check();
      await submitAndAwaitAction(
        page,
        page.getByRole("button", { name: "Uložit výjimky" }),
      );
      await expect(
        page.getByRole("status").filter({ hasText: "Výjimky uloženy." }),
      ).toBeVisible();

      // Nový formulář subjektu: bez polí sazeb a poznámky k odměně.
      await intern.goto("/subjects", { waitUntil: "networkidle" });
      const form = intern.locator("#new-subject form");
      await expect(form.getByRole("button", { name: "Vytvořit subjekt" })).toBeVisible();
      for (const field of ["hourlyRate", "flatFee", "feeNote"]) {
        await expect(form.locator(`[name="${field}"]`)).toHaveCount(0);
      }
      await form.getByRole("textbox", { name: "Název", exact: true }).fill(name);
      // Podvržená pole (přímý POST) server bez oprávnění ignoruje.
      await form.evaluate((element) => {
        for (const [field, value] of [
          ["hourlyRate", "9999"],
          ["flatFee", "8888"],
          ["feeNote", "Podvržená sazba"],
        ]) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = field;
          input.value = value;
          element.appendChild(input);
        }
      });
      await form.getByRole("button", { name: "Vytvořit subjekt" }).click();
      await expect(intern).toHaveURL(/\/subjects\/[a-z0-9]+$/);
      const subjectId = intern.url().split("/").pop() as string;

      const client = new Client({ connectionString: E2E_DATABASE_URL });
      await client.connect();
      try {
        const created = await client.query<{
          hourlyRate: string | null;
          flatFee: string | null;
          feeNote: string | null;
        }>(
          `SELECT "hourlyRate", "flatFee", "feeNote" FROM "subjects" WHERE "id" = $1`,
          [subjectId],
        );
        expect(created.rows[0]).toEqual({ hourlyRate: null, flatFee: null, feeNote: null });

        // Sazbu a poznámku nastaví někdo s oprávněním (zde přímo v DB).
        await client.query(
          `UPDATE "subjects" SET "hourlyRate" = 1537, "feeNote" = 'Sazba dle smlouvy' WHERE "id" = $1`,
          [subjectId],
        );

        // Detail: podmínky bez sazeb a poznámky k odměně.
        await intern.goto(`/subjects/${subjectId}`);
        await expect(
          intern.getByRole("heading", { name: "Podmínky poskytování právních služeb" }),
        ).toBeVisible();
        await expect(intern.getByText(/1\s?537/)).toHaveCount(0);
        await expect(intern.getByText("Sazba dle smlouvy")).toHaveCount(0);
        await expect(intern.getByText("Poznámka k odměně", { exact: true })).toHaveCount(0);

        // Úprava: bez polí sazeb; podvržená hodnota uloženou sazbu nepřepíše.
        await intern.goto(`/subjects/${subjectId}/edit`, { waitUntil: "networkidle" });
        const editForm = intern.locator("form").filter({
          has: intern.getByRole("button", { name: "Uložit subjekt" }),
        });
        for (const field of ["hourlyRate", "flatFee", "feeNote"]) {
          await expect(editForm.locator(`[name="${field}"]`)).toHaveCount(0);
        }
        await editForm.evaluate((element) => {
          for (const [field, value] of [
            ["hourlyRate", "1"],
            ["feeNote", ""],
          ]) {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = field;
            input.value = value;
            element.appendChild(input);
          }
        });
        await editForm.getByRole("button", { name: "Uložit subjekt" }).click();
        await expect(intern).toHaveURL(new RegExp(`/subjects/${subjectId}$`));
        const updated = await client.query<{
          hourlyRate: string | null;
          feeNote: string | null;
        }>(`SELECT "hourlyRate", "feeNote" FROM "subjects" WHERE "id" = $1`, [subjectId]);
        expect(Number(updated.rows[0].hourlyRate)).toBe(1537);
        expect(updated.rows[0].feeNote).toBe("Sazba dle smlouvy");
      } finally {
        await client.end();
      }

      // Administrátor sazbu i poznámku v detailu vidí.
      await page.goto(`/subjects/${subjectId}`);
      await expect(page.getByText(/1\s?537/).first()).toBeVisible();
      await expect(page.getByText("Sazba dle smlouvy")).toBeVisible();
    } finally {
      await page.goto("/settings/permissions");
      await page
        .getByRole("link", { name: "Upravit výjimky – Praktikant Demo" })
        .click();
      const reset = page.getByRole("button", { name: "Zrušit všechny výjimky" });
      if ((await reset.count()) > 0) {
        await reset.click();
        const dialog = page.getByRole("dialog", { name: "Zrušit všechny výjimky" });
        await submitAndAwaitAction(
          page,
          dialog.getByRole("button", { name: "Zrušit výjimky" }),
        );
        await expect(dialog).toBeHidden();
      }
      await intern.context().close();
    }
  });

  test("praktikant se „Spravuje uživatele“ nezaloží administrátora ani nezmění jeho heslo", async ({
    page,
    browser,
  }) => {
    const intern = await pageAs(browser, "intern");

    // ID administrátora z jeho vlastního formuláře resetu hesla.
    await page.goto("/settings");
    const adminId = await page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Reset hesla uživatele" }) })
      .getByRole("combobox", { name: "Uživatel", exact: true })
      .locator("option", { hasText: "Admin Demo" })
      .getAttribute("value");
    expect(adminId).toBeTruthy();

    await page.goto("/settings/permissions");
    await page
      .getByRole("link", { name: "Upravit výjimky – Praktikant Demo" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Oprávnění: Praktikant Demo", level: 1 }),
    ).toBeVisible();

    try {
      await page
        .getByRole("group", { name: "Spravuje uživatele" })
        .getByLabel("Povolit")
        .check();
      await submitAndAwaitAction(
        page,
        page.getByRole("button", { name: "Uložit výjimky" }),
      );
      await expect(
        page.getByRole("status").filter({ hasText: "Výjimky uloženy." }),
      ).toBeVisible();

      await intern.goto("/settings");
      const createSection = intern
        .locator("section")
        .filter({ has: intern.getByRole("heading", { name: "Nový uživatel", level: 2 }) });
      const roleSelect = createSection.getByRole("combobox", { name: "Role", exact: true });
      await expect(roleSelect).toBeVisible();
      // Formulář nenabízí role, které by praktikantovi daly víc práv.
      await expect(roleSelect.locator('option[value="ADMIN"]')).toHaveCount(0);
      await expect(roleSelect.locator('option[value="PARTNER"]')).toHaveCount(0);
      await expect(roleSelect.locator('option[value="LAWYER"]')).toHaveCount(1);

      // Podvržená hodnota ADMIN: server založení odmítne.
      await roleSelect.evaluate((select: HTMLSelectElement) => {
        const option = document.createElement("option");
        option.value = "ADMIN";
        option.textContent = "Admin";
        select.appendChild(option);
        select.value = "ADMIN";
      });
      const forgedName = e2eName("admin-pokus");
      await createSection.getByLabel("Jméno", { exact: true }).fill(forgedName);
      await createSection.getByLabel("E-mail", { exact: true }).fill(`${forgedName}@example.local`);
      await createSection.getByLabel(/Počáteční heslo/).fill("heslo-pokus-123");
      await submitAndAwaitAction(
        intern,
        createSection.getByRole("button", { name: "Vytvořit uživatele" }),
      );
      await expect(createSection.getByRole("alert")).toHaveText(
        "Roli Administrátor může přidělit nebo odebrat jen administrátor.",
      );
      await expect(intern.getByRole("cell", { name: forgedName })).toHaveCount(0);

      // Reset hesla: administrátor ani partner v nabídce nejsou…
      const resetSection = intern
        .locator("section")
        .filter({ has: intern.getByRole("heading", { name: "Reset hesla uživatele" }) });
      const target = resetSection.getByRole("combobox", { name: "Uživatel", exact: true });
      await expect(target.locator("option", { hasText: "Admin Demo" })).toHaveCount(0);
      await expect(target.locator("option", { hasText: "Partner Demo" })).toHaveCount(0);
      await expect(target.locator("option", { hasText: "Advokát Demo" })).toHaveCount(1);
      // …a podvržené ID administrátora server odmítne (heslo zůstane stejné).
      await target.evaluate((select: HTMLSelectElement, id) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = "Admin Demo";
        select.appendChild(option);
        select.value = id;
      }, adminId as string);
      await resetSection.getByLabel(/Nové heslo/).fill("demo1234");
      await resetSection.getByRole("button", { name: "Nastavit heslo" }).click();
      await expect(
        intern.getByRole("heading", { name: "Něco se pokazilo" }),
      ).toBeVisible();
      // Relace administrátora platí dál (reset by zvýšil sessionVersion).
      await page.goto("/settings");
      await expect(page).toHaveURL(/\/settings$/);
    } finally {
      await page.goto("/settings/permissions");
      await page
        .getByRole("link", { name: "Upravit výjimky – Praktikant Demo" })
        .click();
      await page
        .getByRole("button", { name: "Zrušit všechny výjimky" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Zrušit všechny výjimky" });
      await submitAndAwaitAction(
        page,
        dialog.getByRole("button", { name: "Zrušit výjimky" }),
      );
      await expect(dialog).toBeHidden();
    }
    await intern.context().close();
  });

  test("praktikant jako schvalovatel u klienta schválí výkaz i bez sekce Fakturace", async ({
    page,
    browser,
  }) => {
    const intern = await pageAs(browser, "intern");
    const description = e2eName("schvalovatel-vykaz");

    // Praktikant zapíše fakturovatelný výkaz (čeká na schválení).
    await intern.goto("/work-logs");
    await intern.getByRole("link", { name: "Nový výkaz" }).click();
    const form = intern.getByRole("dialog", { name: "Nový výkaz práce" });
    await form
      .getByRole("combobox", { name: "Subjekt", exact: true })
      .selectOption({ label: "ABC s.r.o., IČO 12345678" });
    await form
      .getByRole("combobox", { name: "Projekt", exact: true })
      .selectOption({ label: "Soudní spor ABC" });
    await form.getByLabel("Hodiny").fill("0.5");
    await form.getByLabel("Popis práce").fill(description);
    await submitAndAwaitAction(
      intern,
      form.getByRole("button", { name: "Vytvořit výkaz" }),
    );
    await expect(form).toBeHidden();

    // Administrátor ho určí schvalovatelem klienta ABC s.r.o.
    await page.goto("/subjects");
    await page.getByRole("link", { name: "ABC s.r.o." }).first().click();
    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);
    const subjectUrl = page.url();
    const removeApprover = page.getByRole("button", {
      name: "Odebrat schvalovatele Praktikant Demo",
    });
    if ((await removeApprover.count()) === 0) {
      await page
        .getByRole("combobox", { name: "Přidat schvalovatele", exact: true })
        .selectOption({ label: "Praktikant Demo" });
      await submitAndAwaitAction(
        page,
        page.getByRole("button", { name: "Přidat", exact: true }),
      );
    }
    await expect(removeApprover).toBeVisible();

    try {
      // Sekce Fakturace v menu zůstává skrytá…
      await intern.goto("/dashboard");
      await expect(
        intern
          .getByRole("navigation", { name: "Hlavní navigace" })
          .getByRole("link", { name: "Fakturace" }),
      ).toHaveCount(0);
      // …ale schvalování výkazů klienta funguje.
      await intern.goto("/billing/approvals");
      await expect(
        intern.getByRole("heading", { name: "Položky ke schválení", level: 1 }),
      ).toBeVisible();
      await expect(intern.getByText("Přístup odepřen")).toHaveCount(0);
      const card = intern
        .getByTestId("approval-card")
        .filter({ hasText: description });
      await expect(card).toHaveCount(1);
      // Bez „Vidí sazby a částky“ schvalovatel sazbu nevidí.
      await expect(card.getByLabel("Sazba")).toHaveCount(0);
      await submitAndAwaitAction(
        intern,
        card.getByRole("button", { name: "Schválit", exact: true }),
      );
      await expect(card).toHaveCount(0);
      await expectNoErrorPage(intern);
    } finally {
      await page.goto(subjectUrl);
      await submitAndAwaitAction(page, removeApprover);
      await expect(removeApprover).toHaveCount(0);
    }
    await intern.context().close();
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
