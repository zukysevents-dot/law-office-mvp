import { expect, test } from "@playwright/test";

import { expectDatabaseReady, expectNoErrorPage } from "./support/helpers";

// Každý modul: URL + h1 + jedna konkrétní uživatelsky viditelná sekce/tabulka.
// `section` je nadpis <h2>, `text` volitelný další viditelný obsah.
const modules: Array<{
  route: string;
  heading: string;
  section?: string;
  text?: RegExp | string;
}> = [
  { route: "/dashboard", heading: "Dashboard", section: "Subjekty" },
  { route: "/subjects", heading: "Subjekty", section: "Seznam subjektů" },
  { route: "/conflict-check", heading: "Conflict check", section: "Výsledek prověření" },
  { route: "/registry", heading: "Hlídání rejstříků", text: /Nepotvrzené změny/ },
  { route: "/aml", heading: "AML / KYC", section: "Nová kontrola / identifikace" },
  { route: "/projects", heading: "Projekty", section: "Seznam projektů" },
  { route: "/cases", heading: "Případy", section: "Seznam případů" },
  { route: "/tasks", heading: "Úkoly", section: "Seznam úkolů" },
  { route: "/tasks/my", heading: "Moje úkoly", section: "Moje aktivní úkoly" },
  { route: "/tasks/archive", heading: "Archiv úkolů", section: "Archivované úkoly" },
  { route: "/work-logs", heading: "Výkazy práce", section: "Seznam výkazů práce" },
  {
    route: "/work-logs/timesheet",
    heading: "Výkaz práce pro klienta",
    section: "Nastavení výkazu",
  },
  { route: "/billing", heading: "Fakturace", section: "Položky k fakturaci" },
  { route: "/billing/invoices", heading: "Faktury", section: "Přehled faktur" },
  { route: "/billing/invoices/new", heading: "Nová faktura", section: "Klient" },
  { route: "/billing/retainers", heading: "Paušály", section: "Přehled paušálů" },
  {
    route: "/billing/approvals",
    heading: "Položky ke schválení",
    section: "Ke schválení",
  },
  { route: "/reports", heading: "Reporty a exporty", section: "Reporty" },
  { route: "/reports/hours", heading: "Měsíční přehled hodin", section: "Filtry" },
  { route: "/reports/billability", heading: "KPI fakturovatelnosti", section: "Fakturovatelnost" },
  { route: "/reports/by-client", heading: "Reporting podle klientů", section: "Filtry" },
  { route: "/reports/by-person", heading: "Reporting podle lidí", section: "Filtry" },
  {
    route: "/reports/by-legal-area",
    heading: "Reporting podle právních oblastí",
    section: "Filtry",
  },
  { route: "/reports/wip", heading: "Rozpracovanost (WIP)", section: "Filtry" },
  { route: "/references", heading: "Reference", section: "Seznam referencí" },
  { route: "/deadlines", heading: "Lhůtník", section: "Po termínu" },
  { route: "/calendar", heading: "Kalendář" },
  { route: "/documents", heading: "Spisy", section: "Hledání" },
  {
    route: "/documents/templates",
    heading: "Šablony dokumentů",
    section: "Šablony",
  },
  { route: "/data-boxes", heading: "Datové schránky", section: "Zprávy" },
  { route: "/hr/employees", heading: "Zaměstnanci", section: "Seznam zaměstnanců" },
  { route: "/hr/attendance", heading: "Docházka", section: "Zapsat docházku" },
  { route: "/hr/absences", heading: "Absence", section: "Žádosti" },
  { route: "/hr/exports", heading: "Mzdový export", section: "Export za období" },
  { route: "/audit-log", heading: "Audit log", section: "Auditní záznamy" },
  { route: "/settings", heading: "Nastavení", section: "Uživatelé" },
  {
    route: "/settings/organization",
    heading: "Nastavení kanceláře",
    section: "Členové kanceláře",
  },
  {
    route: "/settings/billing",
    heading: "Fakturační údaje kanceláře",
    section: "Údaje vystavitele",
  },
  {
    route: "/settings/data-boxes",
    heading: "Datové schránky — přístup",
    section: "Datové schránky kanceláře",
  },
  {
    route: "/dashboard/settings",
    heading: "Nastavení dashboardu",
    section: "Widgety",
  },
];

for (const appModule of modules) {
  test(`modul ${appModule.route} se vykreslí s obsahem`, async ({ page }) => {
    // domcontentloaded: obsah ověřují až aserce níž (auto-waiting), takže není
    // nutné čekat na všechny klientské chunky (kalendář je lazy-loaded).
    const response = await page.goto(appModule.route, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBeLessThan(400);

    await expect(
      page.getByRole("heading", { name: appModule.heading, level: 1 }),
    ).toBeVisible();
    if (appModule.section) {
      await expect(
        page.getByRole("heading", { name: appModule.section, level: 2 }).first(),
      ).toBeVisible();
    }
    if (appModule.text) {
      await expect(page.getByText(appModule.text).first()).toBeVisible();
    }
    await expectNoErrorPage(page);
    await expectDatabaseReady(page);
  });
}

test.describe("detailní routy s reálnými ID ze seedu", () => {
  test("detail subjektu se otevře ze seznamu", async ({ page }) => {
    await page.goto("/subjects");
    await page.getByRole("link", { name: "ABC s.r.o." }).first().click();

    await expect(page).toHaveURL(/\/subjects\/[a-z0-9]+$/);
    await expect(
      page.getByRole("heading", { name: "ABC s.r.o.", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("12345678").first()).toBeVisible();
  });

  test("detail projektu se otevře ze seznamu", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: "Soudní spor ABC" }).first().click();

    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);
    await expect(
      page.getByRole("heading", { name: "Soudní spor ABC", level: 1 }),
    ).toBeVisible();
  });

  test("detail případu se otevře ze seznamu", async ({ page }) => {
    await page.goto("/cases");
    await page.getByRole("link", { name: "Žaloba na zaplacení" }).first().click();

    await expect(page).toHaveURL(/\/cases\/[a-z0-9]+$/);
    await expect(
      page.getByRole("heading", { name: "Žaloba na zaplacení", level: 1 }),
    ).toBeVisible();
  });

  test("detail úkolu ukazuje workflow a historii", async ({ page }) => {
    await page.goto("/tasks");
    await page
      .getByRole("link", { name: "Připravit vyjádření k žalobě" })
      .first()
      .click();

    await expect(page).toHaveURL(/\/tasks\/[a-z0-9]+$/);
    await expect(
      page.getByRole("heading", { name: "Připravit vyjádření k žalobě", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Změnit status", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Komentáře", level: 2 }),
    ).toBeVisible();
  });
});
