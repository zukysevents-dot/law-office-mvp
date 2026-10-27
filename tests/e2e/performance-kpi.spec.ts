import { expect, test, type Locator, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { Client } from "pg";

import { E2E_DATABASE_URL, E2E_USERS } from "./support/e2e-env";
import {
  appAlert,
  e2eName,
  expectNoErrorPage,
  expectNoHorizontalScroll,
  pageAs,
  submitAndAwaitAction,
} from "./support/helpers";

// KPI a výkonnost (audit balík 08): plán hodin s cílem fakturovatelných hodin,
// graf „Přehled hodin“ na dashboardu (sloupce mají výšku) a stránka Výkonnost
// (tabulka, filtry, řazení, detail, docházka, export, přístup).
//
// Přesná čísla se ověřují ve fixním historickém okně 3.–9. 3. 2025 (jiné
// specy tam nic nezapisují). V aktuálním týdnu/měsíci jen ≥, protože paralelní
// specy mohou advokátovi přidat výkazy i úkoly. Praktikant se tu nepoužívá
// (vyhrazen sériovému bloku v roles-and-permissions.spec.ts). Testy v souboru
// na sebe navazují; úklid je v afterAll (+ prepare-e2e-db.ts).
test.describe.configure({ mode: "serial" });

const ADVOKAT = E2E_USERS.lawyer.name;
const KONCIPIENT = E2E_USERS.trainee.name;
const NOTE = "e2e-kpi";
const WINDOW = { from: "2025-03-03", to: "2025-03-09" };
const WINDOW_QUERY = `period=custom&from=${WINDOW.from}&to=${WINDOW.to}`;
const overdueTitle = e2eName("kpi-po-terminu");

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
  admin: string;
  lawyer: string;
  trainee: string;
  traineeEmployee: string | null;
};
let ids: Ids;

async function loadIds(): Promise<Ids> {
  return withDb(async (db) => {
    const users = await db.query(
      `select u.id, u.email, m."organizationId" from users u
         join "organizationMembers" m on m."userId" = u.id
        where u.email = any($1)`,
      [[E2E_USERS.admin.email, E2E_USERS.lawyer.email, E2E_USERS.trainee.email]],
    );
    const byEmail = new Map(users.rows.map((row) => [row.email, row]));
    const trainee = byEmail.get(E2E_USERS.trainee.email);
    const employee = await db.query(`select id from "hrEmployees" where "userId" = $1`, [
      trainee.id,
    ]);
    return {
      orgId: trainee.organizationId,
      admin: byEmail.get(E2E_USERS.admin.email).id,
      lawyer: byEmail.get(E2E_USERS.lawyer.email).id,
      trainee: trainee.id,
      traineeEmployee: employee.rows[0]?.id ?? null,
    };
  });
}

async function insertWorkLog(
  db: Client,
  input: { userId: string; date: string; hours: number; billing: string; approval?: string },
) {
  await db.query(
    `insert into "workLogs" (id, "organizationId", "userId", "workDate", hours, "billingStatus", "approvalStatus", description, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
    [
      e2eName("kpi-log"),
      ids.orgId,
      input.userId,
      `${input.date}T00:00:00.000Z`,
      input.hours,
      input.billing,
      input.approval ?? "DRAFT",
      e2eName(`kpi-${input.date}`),
    ],
  );
}

// Kancelářský den (Europe/Prague) — stejně jako officeWorkDate na serveru.
function officeToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function planForm(page: Page, name: string) {
  return page.getByRole("form", { name: `Plán hodin: ${name}` });
}

function row(page: Page, name: string) {
  return page.locator(`tr[data-performance-row="${name}"]`);
}

function cell(page: Page, name: string, column: string) {
  return row(page, name).locator(`[data-col="${column}"]`);
}

async function barHeight(locator: Locator) {
  const box = await locator.boundingBox();
  return box?.height ?? 0;
}

// Období přes formulář (Od/Do přepne na „Vlastní“). Opakuje se, dokud React
// nepřevezme hodnoty (vyplnění před hydratací by se ztratilo).
async function applyWindow(page: Page) {
  const period = page.locator(`select[name="period"]`);
  await expect(async () => {
    await page.getByLabel("Od", { exact: true }).fill(WINDOW.from);
    await page.getByLabel("Do", { exact: true }).fill(WINDOW.to);
    await expect(period).toHaveValue("custom", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("button", { name: "Použít filtry" }).click();
  await expect(page).toHaveURL(/from=2025-03-03/);
  await expect(page.locator("[data-performance-period]")).toHaveText("3. 3. – 9. 3. 2025");
}

const insertedWidgets: string[] = [];

test.beforeAll(async () => {
  ids = await loadIds();
  await withDb(async (db) => {
    // Fixní okno: advokát 7 h (5 fakturovatelných k schválení + 2 interní),
    // koncipient 1 h fakturovatelná + 1,5 h zamítnutá (= nefakturovatelná).
    await insertWorkLog(db, { userId: ids.lawyer, date: "2025-03-04", hours: 5, billing: "BILLABLE" });
    await insertWorkLog(db, {
      userId: ids.lawyer,
      date: "2025-03-04",
      hours: 2,
      billing: "INTERNAL_NON_BILLABLE",
    });
    await insertWorkLog(db, { userId: ids.trainee, date: "2025-03-05", hours: 1, billing: "BILLABLE" });
    await insertWorkLog(db, {
      userId: ids.trainee,
      date: "2025-03-05",
      hours: 1.5,
      billing: "BILLABLE",
      approval: "REJECTED",
    });
  });
});

test.afterAll(async () => {
  await withDb(async (db) => {
    await db.query(`delete from "workLogs" where description like 'e2e-kpi-%'`);
    await db.query(`delete from tasks where title = $1`, [overdueTitle]);
    await db.query(`delete from "hrAttendanceRecords" where note = $1`, [NOTE]);
    await db.query(`delete from "hrAbsenceRequests" where note = $1`, [NOTE]);
    await db.query(`delete from "userHoursPlans" where "userId" = any($1)`, [
      [ids.lawyer, ids.trainee],
    ]);
    if (insertedWidgets.length > 0) {
      await db.query(`delete from "dashboardWidgets" where id = any($1)`, [insertedWidgets]);
    }
  });
});

test("admin nastaví KPI fakturovatelných hodin v plánu hodin", async ({ page }) => {
  await page.goto("/settings#plan-hodin");
  await expect(
    page.getByRole("heading", { name: "Plán hodin pracovníků (KPI)", level: 2 }),
  ).toBeVisible();
  const form = planForm(page, ADVOKAT);
  await form.getByLabel("Týdně celkem (h)").fill("40");
  await form.getByLabel("Týdně fakturovatelné (h)").fill("30");
  await form.getByLabel("Měsíčně celkem (h)").fill("160");
  await form.getByLabel("Měsíčně fakturovatelné (h)").fill("120");
  await submitAndAwaitAction(page, form.getByRole("button", { name: "Uložit" }));

  // Bez reloadu: hláška pod řádkem a hodnoty zůstanou v polích.
  await expect(form.getByRole("status")).toHaveText("Plán hodin uložen.");
  await expect(form.getByLabel("Týdně fakturovatelné (h)")).toHaveValue("30");

  await page.reload();
  const reloaded = planForm(page, ADVOKAT);
  await expect(reloaded.getByLabel("Týdně celkem (h)")).toHaveValue("40");
  await expect(reloaded.getByLabel("Týdně fakturovatelné (h)")).toHaveValue("30");
  await expect(reloaded.getByLabel("Měsíčně celkem (h)")).toHaveValue("160");
  await expect(reloaded.getByLabel("Měsíčně fakturovatelné (h)")).toHaveValue("120");

  const audit = await withDb((db) =>
    db.query(
      `select action, "newValue"->>'weeklyBillableHoursTarget' as weekly
         from "auditLogs" a join "userHoursPlans" p on p.id = a."entityId"
        where a."entityType" = 'UserHoursPlan' and p."userId" = $1
        order by a."createdAt" desc limit 1`,
      [ids.lawyer],
    ),
  );
  expect(audit.rows[0]?.action).toBe("CREATE");
  expect(Number(audit.rows[0]?.weekly)).toBe(30);
});

test("fakturovatelný cíl nad celkovým se neuloží a hodnoty zůstanou", async ({ page }) => {
  await page.goto("/settings#plan-hodin");
  const form = planForm(page, KONCIPIENT);
  await form.getByLabel("Týdně celkem (h)").fill("20");
  await form.getByLabel("Týdně fakturovatelné (h)").fill("25");
  await submitAndAwaitAction(page, form.getByRole("button", { name: "Uložit" }));

  await expect(form.getByRole("alert")).toHaveText(
    "Cíl fakturovatelných hodin nemůže být vyšší než cíl hodin celkem.",
  );
  await expect(form.getByLabel("Týdně fakturovatelné (h)")).toHaveValue("25");
  await expect(form.getByLabel("Týdně celkem (h)")).toHaveValue("20");

  const plans = await withDb((db) =>
    db.query(`select id from "userHoursPlans" where "userId" = $1`, [ids.trainee]),
  );
  expect(plans.rowCount).toBe(0);
});

test("dashboard: sloupce hodin mají výšku, cílové značky a přepínač Týden/Měsíc", async ({
  browser,
}) => {
  const today = officeToday();
  await withDb(async (db) => {
    await insertWorkLog(db, { userId: ids.lawyer, date: today, hours: 3, billing: "BILLABLE" });
    await insertWorkLog(db, {
      userId: ids.lawyer,
      date: today,
      hours: 1,
      billing: "INTERNAL_NON_BILLABLE",
    });
    // Seedovaní uživatelé mají legacy widget „Hodiny tento měsíc“; graf si
    // test dočasně vloží (jen E2E DB) a v afterAll smaže.
    for (const userId of [ids.lawyer, ids.trainee]) {
      const id = e2eName("kpi-widget");
      const result = await db.query(
        `insert into "dashboardWidgets" (id, "userId", type, title, position, size, visible, config, "createdAt", "updatedAt")
         values ($1, $2, 'WEEKLY_HOURS_CHART', 'Přehled hodin', 0, 'FULL', true, '{}', now(), now())
         on conflict ("userId", type) do nothing returning id`,
        [id, userId],
      );
      if ((result.rowCount ?? 0) > 0) insertedWidgets.push(id);
    }
  });

  const lawyer = await pageAs(browser, "lawyer");
  try {
    await lawyer.goto("/dashboard");
    const widget = lawyer.locator('[data-widget="hours-kpi"]');
    await expect(widget.getByRole("heading", { name: "Přehled hodin" })).toBeVisible();
    const panel = widget.getByRole("tabpanel");
    const todayBucket = panel.locator(`[data-kpi-bucket="${today}"]`);

    // Regrese příčiny: sloupec dneška má skutečnou výšku (dřív 0 px).
    await expect(todayBucket.locator('[data-kpi="bar-billable"]')).toBeVisible();
    expect(await barHeight(todayBucket.locator('[data-kpi="bar-billable"]'))).toBeGreaterThan(0);
    expect(await barHeight(todayBucket.locator('[data-kpi="bar-nonbillable"]'))).toBeGreaterThan(0);
    await expect(panel.locator('[data-kpi="target-total"]').first()).toBeVisible();
    await expect(panel.locator('[data-kpi="target-billable"]').first()).toBeVisible();
    await expect(panel.locator('[data-kpi-summary="total"]')).toContainText("z 40 h");
    await expect(panel.locator('[data-kpi-summary="billable"]')).toContainText("Fakturovatelné");
    await expect(panel.locator('[data-kpi-summary="billable"]')).toContainText("z 30 h");
    await expect(widget.getByText("Moje hodiny tento měsíc")).toBeVisible();

    await widget.getByRole("tab", { name: "Měsíc" }).click();
    await expect(widget.getByRole("tab", { name: "Měsíc" })).toHaveAttribute("aria-selected", "true");
    const monthPanel = widget.getByRole("tabpanel");
    await expect(monthPanel.locator('[data-kpi-summary="total"]')).toContainText("Tento měsíc");
    await expect(monthPanel.locator('[data-kpi-summary="total"]')).toContainText("z 160 h");
    const currentWeek = monthPanel.locator('[data-kpi-current="true"]');
    expect(await barHeight(currentWeek.locator('[data-kpi="bar-billable"]'))).toBeGreaterThan(0);

    // Mobil: graf se vejde, stránka neroluje do strany.
    await lawyer.setViewportSize({ width: 375, height: 812 });
    await lawyer.reload();
    await expect(widget.getByRole("tabpanel")).toBeVisible();
    await expectNoHorizontalScroll(lawyer);
  } finally {
    await lawyer.context().close();
  }

  // Koncipient: graf je, žádné částky.
  const trainee = await pageAs(browser, "trainee");
  try {
    await trainee.goto("/dashboard");
    const widget = trainee.locator('[data-widget="hours-kpi"]');
    await expect(widget.getByRole("tab", { name: "Týden" })).toBeVisible();
    await expect(widget.locator("[data-kpi-chart]").first()).toBeVisible();
    await expect(widget).not.toContainText("Kč");
    // Koncipient plán nemá (test 2 se neuložil) → odkaz na Nastavení jen
    // pro správce, koncipient dostane jen informaci.
    await expect(
      widget.getByRole("tabpanel").getByText(/Plán hodin nenastaven/),
    ).toBeVisible();
  } finally {
    await trainee.context().close();
  }
});

test("Výkonnost: tabulka, filtry, řazení a předchozí období", async ({ page }) => {
  await page.goto("/dashboard");
  await page
    .getByRole("navigation", { name: "Hlavní navigace" })
    .getByRole("link", { name: "Výkonnost" })
    .click();
  await expect(page.getByRole("heading", { name: "Výkonnost", level: 1 })).toBeVisible();
  await expectNoErrorPage(page);

  await applyWindow(page);

  await expect(cell(page, ADVOKAT, "total")).toContainText("7");
  await expect(cell(page, ADVOKAT, "total")).toContainText("/ 40 h");
  await expect(cell(page, ADVOKAT, "total")).toContainText("18 %");
  await expect(cell(page, ADVOKAT, "billable")).toContainText("5");
  await expect(cell(page, ADVOKAT, "billable")).toContainText("/ 30 h");
  await expect(cell(page, ADVOKAT, "billable")).toContainText("17 %");
  await expect(cell(page, ADVOKAT, "nonBillable")).toHaveText("2 h");
  await expect(cell(page, KONCIPIENT, "billable")).toContainText("1 h");
  await expect(cell(page, KONCIPIENT, "billable")).toContainText("plán nenastaven");
  await expect(cell(page, KONCIPIENT, "nonBillable")).toHaveText("1,5 h");
  await expect(page.locator("[data-performance-total]")).toContainText("Celkem");

  // Filtr role (období zůstává).
  await page.locator(`select[name="role"]`).selectOption({ label: "Koncipient" });
  await page.getByRole("button", { name: "Použít filtry" }).click();
  await expect(page).toHaveURL(/role=TRAINEE/);
  await expect(page.locator("tr[data-performance-row]")).toHaveCount(1);
  await expect(row(page, KONCIPIENT)).toBeVisible();
  await expect(page.locator("[data-performance-period]")).toHaveText("3. 3. – 9. 3. 2025");

  // Tým „Sporná agenda“ = advokát + koncipient (ne admin / partner).
  await page.locator(`select[name="role"]`).selectOption("");
  await page.locator(`select[name="teamId"]`).selectOption({ label: "Sporná agenda" });
  await page.getByRole("button", { name: "Použít filtry" }).click();
  await expect(page).toHaveURL(/teamId=/);
  await expect(row(page, ADVOKAT)).toBeVisible();
  await expect(row(page, KONCIPIENT)).toBeVisible();
  await expect(row(page, E2E_USERS.admin.name)).toHaveCount(0);
  await expect(row(page, E2E_USERS.partner.name)).toHaveCount(0);

  // Osoba.
  await page.locator(`select[name="teamId"]`).selectOption("");
  await page.locator(`select[name="userId"]`).selectOption({ label: ADVOKAT });
  await page.getByRole("button", { name: "Použít filtry" }).click();
  await expect(page.locator("tr[data-performance-row]")).toHaveCount(1);
  await expect(row(page, ADVOKAT)).toBeVisible();

  // Zrušit filtry → výchozí aktuální měsíc, všichni.
  await page.getByRole("link", { name: "Zrušit filtry" }).click();
  await expect(page).toHaveURL(/\/performance$/);
  await expect(page.locator(`select[name="period"]`)).toHaveValue("month");
  await expect(row(page, E2E_USERS.admin.name)).toBeVisible();

  // Řazení podle hodin celkem: 1. klik vzestupně, 2. klik sestupně.
  await page.goto(`/performance?${WINDOW_QUERY}`);
  const header = page.getByRole("columnheader", { name: "Hodiny celkem" });
  await header.getByRole("link").click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await header.getByRole("link").click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator("tr[data-performance-row]").first()).toHaveAttribute(
    "data-performance-row",
    ADVOKAT,
  );

  // Předchozí měsíc.
  await page.goto("/performance");
  const label = page.locator("[data-performance-period]");
  const current = (await label.textContent()) ?? "";
  await page.getByRole("link", { name: "Předchozí" }).click();
  await expect(page).toHaveURL(/anchor=/);
  await expect(label).not.toHaveText(current);
  await expectNoErrorPage(page);
});

test("Výkonnost: úkoly po termínu u všech řešitelů a odkaz do úkolů", async ({ page }) => {
  await withDb(async (db) => {
    const taskId = e2eName("kpi-task");
    await db.query(
      `insert into tasks (id, "organizationId", title, status, deadline, "assignedToId", "createdById", "createdAt", "updatedAt")
       values ($1, $2, $3, 'IN_PROGRESS', now() - interval '1 day', $4, $5, now(), now())`,
      [taskId, ids.orgId, overdueTitle, ids.lawyer, ids.admin],
    );
    for (const userId of [ids.lawyer, ids.trainee]) {
      await db.query(
        `insert into "taskAssignees" (id, "organizationId", "taskId", "userId", role, "assignedAt")
         values ($1, $2, $3, $4, 'ASSIGNEE', now())`,
        [e2eName("kpi-assignee"), ids.orgId, taskId, userId],
      );
    }
  });

  await page.goto("/performance");
  for (const name of [ADVOKAT, KONCIPIENT]) {
    const overdue = cell(page, name, "overdue");
    await expect(overdue.getByRole("link")).toBeVisible();
    expect(Number(await overdue.innerText())).toBeGreaterThanOrEqual(1);
    expect(Number(await cell(page, name, "open").innerText())).toBeGreaterThanOrEqual(1);
  }

  const link = cell(page, KONCIPIENT, "overdue").getByRole("link");
  await expect(link).toHaveAttribute(
    "href",
    `/tasks?assignedToId=${ids.trainee}&overdue=1`,
  );
  await link.click();
  await expect(page).toHaveURL(/\/tasks\?assignedToId=.*overdue=1/);
  await expect(page.getByRole("link", { name: overdueTitle })).toBeVisible();
});

test("Výkonnost: detail osoby se zachovaným obdobím", async ({ page }) => {
  await page.goto(`/performance?${WINDOW_QUERY}`, { waitUntil: "networkidle" });
  // Klik na řádek mimo odkaz (RowClickNav reaguje až po hydrataci).
  await expect(async () => {
    await cell(page, ADVOKAT, "nonBillable").click();
    await expect(page).toHaveURL(new RegExp(`/performance/${ids.lawyer}\\?.*from=2025-03-03`), {
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: `Výkonnost: ${ADVOKAT}`, level: 1 }),
  ).toBeVisible();
  await expect(page.locator('[data-kpi-card="total"]')).toContainText("7");
  await expect(page.locator('[data-kpi-card="total"]')).toContainText("18 %");
  await expect(page.locator('[data-kpi-card="billable"]')).toContainText("5");
  await expect(page.locator('[data-kpi-card="billable"]')).toContainText("z toho schváleno 0 h");

  const bucket = page.locator('[data-widget="person-hours"] [data-kpi-bucket="2025-03-04"]');
  expect(await barHeight(bucket.locator('[data-kpi="bar-billable"]'))).toBeGreaterThan(0);
  await expect(
    page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Otevřené úkoly", level: 2 }) })
      .getByRole("link", { name: overdueTitle }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Zpět na Výkonnost" }).click();
  await expect(page).toHaveURL(/\/performance\?.*from=2025-03-03/);
  await expect(page.locator("[data-performance-period]")).toHaveText("3. 3. – 9. 3. 2025");

  await page.goto("/performance/neexistujici-uzivatel");
  await expect(
    page.getByRole("heading", { name: "Tuto stránku jsme nenašli" }),
  ).toBeVisible();
});

test("Výkonnost: docházka a absence z HR", async ({ page }) => {
  test.skip(!ids.traineeEmployee, "Seed nemá kartu zaměstnance koncipienta.");
  await withDb(async (db) => {
    await db.query(
      `insert into "hrAttendanceRecords" (id, "organizationId", "employeeId", "workDate", "workedHours", note, "createdAt", "updatedAt")
       values ($1, $2, $3, '2025-03-04', 8, $4, now(), now())
       on conflict ("employeeId", "workDate") do nothing`,
      [e2eName("kpi-att"), ids.orgId, ids.traineeEmployee, NOTE],
    );
    await db.query(
      `insert into "hrAbsenceRequests" (id, "organizationId", "employeeId", type, status, "startDate", "endDate", "requestedHours", note, "createdAt", "updatedAt")
       values ($1, $2, $3, 'SICK', 'APPROVED', '2025-03-06', '2025-03-07', 16, $4, now(), now())`,
      [e2eName("kpi-abs"), ids.orgId, ids.traineeEmployee, NOTE],
    );
  });

  await page.goto(`/performance?${WINDOW_QUERY}`);
  await expect(page.getByRole("columnheader", { name: "Docházka" })).toBeVisible();
  await expect(cell(page, KONCIPIENT, "attendance")).toHaveText("1 den · 8 h");
  await expect(cell(page, KONCIPIENT, "absence")).toHaveText("2 dny");
  await expect(cell(page, ADVOKAT, "attendance")).toHaveText("—");
  await expect(cell(page, ADVOKAT, "attendance")).toHaveAttribute(
    "title",
    "Nemá kartu zaměstnance v HR",
  );
});

test("Výkonnost: export XLSX se stejnými filtry a auditem", async ({ page }) => {
  await page.goto(`/performance?${WINDOW_QUERY}`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export XLSX" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("vykonnost-2025-03-03_2025-03-09.xlsx");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  const sheet = workbook.worksheets[0];
  const headers = (sheet.getRow(1).values as unknown[]).slice(1);
  expect(headers).toContain("Cíl fakturovatelných");
  expect(headers).toContain("Odpracované dny");
  const totalColumn = headers.indexOf("Hodiny celkem") + 1;
  const billableColumn = headers.indexOf("Fakturovatelné hodiny") + 1;
  let lawyerRow: ExcelJS.Row | undefined;
  sheet.eachRow((sheetRow) => {
    if (sheetRow.getCell(1).value === ADVOKAT) lawyerRow = sheetRow;
  });
  expect(lawyerRow).toBeDefined();
  expect(lawyerRow?.getCell(totalColumn).value).toBe(7);
  expect(lawyerRow?.getCell(billableColumn).value).toBe(5);

  const audit = await withDb((db) =>
    db.query(
      `select "newValue"->>'from' as "from" from "auditLogs"
        where "entityType" = 'Performance' and action = 'EXPORT' and "changedById" = $1
        order by "createdAt" desc limit 1`,
      [ids.admin],
    ),
  );
  expect(audit.rows[0]?.from).toBe("2025-03-03");
});

test("Výkonnost: partner má přístup, advokát a koncipient ne", async ({ browser }) => {
  const partner = await pageAs(browser, "partner");
  try {
    await partner.goto("/dashboard");
    await partner
      .getByRole("navigation", { name: "Hlavní navigace" })
      .getByRole("link", { name: "Výkonnost" })
      .click();
    await expect(partner.getByRole("heading", { name: "Výkonnost", level: 1 })).toBeVisible();
    await expect(row(partner, ADVOKAT)).toBeVisible();
  } finally {
    await partner.context().close();
  }

  for (const role of ["lawyer", "trainee"] as const) {
    const page = await pageAs(browser, role);
    try {
      await page.goto("/dashboard");
      await expect(
        page
          .getByRole("navigation", { name: "Hlavní navigace" })
          .getByRole("link", { name: "Výkonnost" }),
      ).toHaveCount(0);
      await page.goto("/performance");
      await expect(page.getByRole("heading", { name: "Přístup odepřen", level: 2 })).toBeVisible();
      await page.goto(`/performance/${ids.lawyer}`);
      await expect(page.getByRole("heading", { name: "Přístup odepřen", level: 2 })).toBeVisible();
      // fetch z prohlížeče: session cookie je `Secure` a APIRequestContext ji
      // přes http://127.0.0.1 neposílá (prohlížeč ano — localhost je secure).
      const status = await page.evaluate(
        async () => (await fetch("/performance/export", { redirect: "manual" })).status,
      );
      expect(status).toBe(403);
    } finally {
      await page.context().close();
    }
  }
});

test("Výkonnost: na mobilu tabulka roluje uvnitř, stránka ne", async ({ browser }) => {
  const page = await pageAs(browser, "admin");
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/performance?${WINDOW_QUERY}`);
    await expect(page.getByRole("heading", { name: "Výkonnost", level: 1 })).toBeVisible();
    await expect(appAlert(page)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    const scroller = page.locator("[data-performance-table]");
    const overflow = await scroller.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeGreaterThan(0);
  } finally {
    await page.context().close();
  }
});
