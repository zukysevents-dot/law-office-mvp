import { expect, test, type Page } from "@playwright/test";

import type { RoleKey } from "./support/e2e-env";
import {
  e2eName,
  expectNoErrorPage,
  openCommandPalette,
  pageAs,
  submitAndAwaitAction,
} from "./support/helpers";

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
    await expect(nav.getByRole("link", { name: "Oprávnění" })).toHaveCount(0);
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
