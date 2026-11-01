import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL, E2E_PREFIX, E2E_USERS } from "./support/e2e-env";
import {
  appAlert,
  e2eName,
  expectNoErrorPage,
  pageAs,
  submitAndAwaitAction,
} from "./support/helpers";

// HR → Aktuality (adresáti: role / konkrétní lidé, úprava, archivace, widget
// na dashboardu) a HR → Plánování přítomnosti (vlastní plán, propis absence,
// maskování typu absence kolegům). Plánuje se ve fixním budoucím týdnu
// 7.–11. 1. 2030, kam jiné specy nezapisují. Úklid v afterAll.
test.describe.configure({ mode: "serial" });

const WEEK = "2030-01-07";
const roleNewsTitle = e2eName("aktualita-koncipienti");
const userNewsTitle = e2eName("aktualita-advokat");

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

type Ids = {
  orgId: string;
  trainee: string;
  traineeEmployee: string;
  lawyerEmployee: string;
  partnerEmployee: string;
  createdEmployees: string[];
  absenceId: string;
};
let ids: Ids;

async function ensureCard(db: Client, userId: string, orgId: string, created: string[]) {
  const existing = await db.query(`select id from "hrEmployees" where "userId" = $1`, [userId]);
  if (existing.rows[0]) {
    return existing.rows[0].id as string;
  }
  const id = `${E2E_PREFIX}emp-${Math.random().toString(36).slice(2, 10)}`;
  await db.query(
    `insert into "hrEmployees" (id, "organizationId", "userId", "firstName", "lastName", "updatedAt")
     values ($1, $2, $3, 'Advokát', 'Demo', now())`,
    [id, orgId, userId],
  );
  created.push(id);
  return id;
}

test.beforeAll(async () => {
  ids = await withDb(async (db) => {
    const users = await db.query(
      `select u.id, u.email, m."organizationId" from users u
         join "organizationMembers" m on m."userId" = u.id
        where u.email = any($1)`,
      [[E2E_USERS.lawyer.email, E2E_USERS.trainee.email, E2E_USERS.partner.email]],
    );
    const byEmail = new Map(users.rows.map((row) => [row.email, row]));
    const trainee = byEmail.get(E2E_USERS.trainee.email);
    const lawyer = byEmail.get(E2E_USERS.lawyer.email);
    const partner = byEmail.get(E2E_USERS.partner.email);
    const orgId = trainee.organizationId as string;
    const created: string[] = [];
    const traineeEmployee = await ensureCard(db, trainee.id, orgId, created);
    const lawyerEmployee = await ensureCard(db, lawyer.id, orgId, created);
    const partnerEmployee = await ensureCard(db, partner.id, orgId, created);
    // Schválená nemoc koncipienta ve středu plánovaného týdne.
    const absenceId = `${E2E_PREFIX}abs-${Math.random().toString(36).slice(2, 10)}`;
    await db.query(
      `insert into "hrAbsenceRequests"
         (id, "organizationId", "employeeId", type, status, "startDate", "endDate", "requestedHours", "updatedAt")
       values ($1, $2, $3, 'SICK', 'APPROVED', '2030-01-09', '2030-01-09', 8, now())`,
      [absenceId, orgId, traineeEmployee],
    );
    return {
      orgId,
      trainee: trainee.id,
      traineeEmployee,
      lawyerEmployee,
      partnerEmployee,
      createdEmployees: created,
      absenceId,
    };
  });
});

test.afterAll(async () => {
  await withDb(async (db) => {
    await db.query(`delete from "hrNews" where title like $1`, [`${E2E_PREFIX}%`]);
    await db.query(
      `delete from "hrPresencePlans" where "employeeId" = any($1) and date >= '2030-01-07' and date < '2030-01-14'`,
      [[ids.traineeEmployee, ids.lawyerEmployee, ids.partnerEmployee]],
    );
    await db.query(`delete from "hrAbsenceRequests" where id = $1`, [ids.absenceId]);
    await db.query(`delete from "dashboardWidgets" where "userId" = $1 and type = 'HR_NEWS'`, [
      ids.trainee,
    ]);
    if (ids.createdEmployees.length > 0) {
      await db.query(`delete from "hrEmployees" where id = any($1)`, [ids.createdEmployees]);
    }
  });
});

test("partner zveřejní aktuality pro roli a pro konkrétního kolegu", async ({ browser }) => {
  const page = await pageAs(browser, "partner");
  await page.goto("/hr/news");
  await expectNoErrorPage(page);
  const form = page.getByTestId("hr-news-form");

  // Role bez výběru → chyba, vyplněná pole zůstanou.
  await form.getByLabel("Nadpis").fill(roleNewsTitle);
  await form.getByLabel("Text").fill("První řádek\n\nTřetí řádek");
  await form.getByRole("radio", { name: "Vybrané role" }).check();
  await submitAndAwaitAction(page, form.getByRole("button", { name: "Zveřejnit aktualitu" }));
  await expect(appAlert(page)).toContainText("aspoň jednu roli");
  await expect(page.getByTestId("hr-news-form").getByLabel("Nadpis")).toHaveValue(roleNewsTitle);
  await expect(
    page.getByTestId("hr-news-form").getByRole("radio", { name: "Vybrané role" }),
  ).toBeChecked();

  await page.getByTestId("hr-news-form").getByRole("checkbox", { name: "Koncipient" }).check();
  await submitAndAwaitAction(
    page,
    page.getByTestId("hr-news-form").getByRole("button", { name: "Zveřejnit aktualitu" }),
  );
  await expect(page.getByRole("status").filter({ hasText: "byla zveřejněna" })).toBeVisible();
  const roleItem = page.getByTestId("hr-news-item").filter({ hasText: roleNewsTitle });
  await expect(roleItem).toContainText("Role: Koncipient");

  const form2 = page.getByTestId("hr-news-form");
  await form2.getByLabel("Nadpis").fill(userNewsTitle);
  await form2.getByLabel("Text").fill("Jen pro advokáta.");
  await form2.getByRole("radio", { name: "Konkrétní kolegové" }).check();
  await page
    .getByTestId("hr-news-form")
    .getByRole("checkbox", { name: E2E_USERS.lawyer.name })
    .check();
  await submitAndAwaitAction(
    page,
    page.getByTestId("hr-news-form").getByRole("button", { name: "Zveřejnit aktualitu" }),
  );
  await expect(
    page.getByTestId("hr-news-item").filter({ hasText: userNewsTitle }),
  ).toContainText(`Vybraní kolegové: ${E2E_USERS.lawyer.name}`);
  await page.context().close();
});

test("koncipient vidí jen aktualitu své role, i na dashboardu; nemůže přidávat", async ({
  browser,
}) => {
  const page = await pageAs(browser, "trainee");
  await page.goto("/hr/news");
  await expectNoErrorPage(page);
  await expect(page.getByTestId("hr-news-form")).toHaveCount(0);
  const item = page.getByTestId("hr-news-item").filter({ hasText: roleNewsTitle });
  await expect(item).toBeVisible();
  // Zalomení řádků zůstává.
  expect(await item.locator("p.whitespace-pre-line").innerText()).toContain("První řádek\n\nTřetí řádek");
  await expect(page.getByText(userNewsTitle)).toHaveCount(0);

  // Widget Aktuality se přidává jako ostatní widgety.
  await page.goto("/dashboard/settings");
  await page.getByTestId("dashboard-widget-type").selectOption("HR_NEWS");
  await submitAndAwaitAction(page, page.getByRole("button", { name: "Přidat widget" }));
  await page.goto("/dashboard");
  const widget = page.locator('[data-widget-type="HR_NEWS"]');
  await expect(widget).toContainText(roleNewsTitle);
  await expect(widget).not.toContainText(userNewsTitle);
  await page.context().close();
});

test("advokát vidí jen aktualitu určenou jemu", async ({ browser }) => {
  const page = await pageAs(browser, "lawyer");
  await page.goto("/hr/news");
  await expect(page.getByTestId("hr-news-item").filter({ hasText: userNewsTitle })).toBeVisible();
  await expect(page.getByText(roleNewsTitle)).toHaveCount(0);
  await page.context().close();
});

test("partner aktualitu upraví a archivuje, vše s audit logem", async ({ browser }) => {
  const page = await pageAs(browser, "partner");
  await page.goto("/hr/news");
  const item = page.getByTestId("hr-news-item").filter({ hasText: roleNewsTitle });
  await item.getByRole("link", { name: "Upravit" }).click();
  const form = page.getByTestId("hr-news-form");
  await expect(form.getByLabel("Nadpis")).toHaveValue(roleNewsTitle);
  await form.getByLabel("Text").fill("Upravený text");
  await submitAndAwaitAction(page, form.getByRole("button", { name: "Uložit změny" }));
  await expect(page).toHaveURL(/\/hr\/news$/);
  const edited = page.getByTestId("hr-news-item").filter({ hasText: roleNewsTitle });
  await expect(edited).toContainText("Upravený text");

  await edited.getByRole("button", { name: "Archivovat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archivovat" }).click();
  await expect(page.getByTestId("hr-news-item").filter({ hasText: roleNewsTitle })).toHaveCount(0);

  const actions = await withDb(async (db) => {
    const rows = await db.query(
      `select a.action from "auditLogs" a join "hrNews" n on n.id = a."entityId"
        where a."entityType" = 'HrNews' and n.title = $1 order by a."createdAt"`,
      [roleNewsTitle],
    );
    return rows.rows.map((row) => row.action);
  });
  expect(actions).toEqual(["CREATE", "UPDATE", "ARCHIVE"]);
  await page.context().close();

  const trainee = await pageAs(browser, "trainee");
  await trainee.goto("/dashboard");
  await expect(trainee.locator('[data-widget-type="HR_NEWS"]')).not.toContainText(roleNewsTitle);
  await trainee.context().close();
});

test("koncipient si naplánuje týden; schválená absence se propíše sama", async ({ browser }) => {
  const page = await pageAs(browser, "trainee");
  await page.goto(`/hr/planning?week=${WEEK}`);
  await expectNoErrorPage(page);
  const form = page.getByTestId("presence-plan-form");
  const day = (date: string) => form.locator(`[data-testid="presence-plan-day"][data-date="${date}"]`);

  // Středa je pokrytá žádostí o absenci — v plánu se nezadává.
  await expect(day("2030-01-09")).toContainText("Nemoc");
  await expect(day("2030-01-09")).toContainText("Z žádosti o absenci");
  await expect(day("2030-01-09").locator("select")).toHaveCount(0);

  await day("2030-01-07").locator("select").selectOption("OFFICE");
  await day("2030-01-07").getByLabel("Poznámka (volitelné)").fill("porada v 9:00");
  await day("2030-01-08").locator("select").selectOption("HOME_OFFICE");
  await submitAndAwaitAction(page, form.getByRole("button", { name: "Uložit plán týdne" }));
  await expect(page.getByRole("status").filter({ hasText: "Plán byl uložen" })).toBeVisible();
  await expect(day("2030-01-07").locator("select")).toHaveValue("OFFICE");

  const myRow = page
    .getByTestId("presence-team-table")
    .locator("tbody tr")
    .filter({ hasText: "(já)" });
  await expect(myRow).toContainText("V kanceláři");
  await expect(myRow).toContainText("porada v 9:00");
  await expect(myRow).toContainText("Home office");
  await expect(myRow).toContainText("Nemoc");

  const audit = await withDb(async (db) =>
    db.query(
      `select count(*)::int as n from "auditLogs" where "entityType" = 'HrPresencePlan' and "entityId" = $1`,
      [ids.traineeEmployee],
    ),
  );
  expect(audit.rows[0].n).toBeGreaterThan(0);
  await page.context().close();
});

test("kolega vidí plán koncipienta, ale ne typ jeho absence", async ({ browser }) => {
  const page = await pageAs(browser, "lawyer");
  await page.goto(`/hr/planning?week=${WEEK}`);
  const traineeRow = page
    .getByTestId("presence-team-table")
    .locator("tbody tr")
    .filter({ hasNotText: "(já)" })
    .filter({ hasText: "porada v 9:00" });
  await expect(traineeRow).toContainText("V kanceláři");
  await expect(traineeRow).toContainText("Nepřítomen");
  await expect(traineeRow).not.toContainText("Nemoc");

  // Cizí plán upravit nejde ani podvrženým parametrem.
  await page.goto(`/hr/planning?week=${WEEK}&employee=${ids.traineeEmployee}`);
  await expect(page.getByRole("heading", { name: "Můj plán" })).toBeVisible();
  await page.context().close();
});

test("správce HR přepne na plán kolegy a formulář ukáže jeho dny, ne své", async ({
  browser,
}) => {
  const page = await pageAs(browser, "partner");
  await page.goto(`/hr/planning?week=${WEEK}`);
  await expectNoErrorPage(page);
  const form = page.getByTestId("presence-plan-form");
  const monday = form.locator('[data-testid="presence-plan-day"][data-date="2030-01-07"]');

  await monday.locator("select").selectOption("OUT_OF_OFFICE");
  await submitAndAwaitAction(page, form.getByRole("button", { name: "Uložit plán týdne" }));
  await expect(page.getByRole("status").filter({ hasText: "Plán byl uložen" })).toBeVisible();
  // Po uložení select ukazuje uložený stav (reset formuláře ho nevrátí).
  await expect(monday.locator("select")).toHaveValue("OUT_OF_OFFICE");

  // Klientská navigace na plán koncipienta: stejné dny, jiný zaměstnanec —
  // formulář musí ukázat jeho plán (V kanceláři), ne partnerův.
  await page
    .getByTestId("presence-team-table")
    .locator(`a[href*="employee=${ids.traineeEmployee}"]`)
    .click();
  await expect(page.getByRole("heading", { name: /^Plán: / })).toBeVisible();
  await expect(form.locator('input[name="employeeId"]')).toHaveValue(ids.traineeEmployee);
  await expect(monday.locator("select")).toHaveValue("OFFICE");
  await expect(monday.getByLabel("Poznámka (volitelné)")).toHaveValue("porada v 9:00");
  await page.context().close();
});
