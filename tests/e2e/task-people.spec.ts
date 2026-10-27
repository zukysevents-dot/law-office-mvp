import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL, E2E_USERS } from "./support/e2e-env";
import {
  e2eName,
  expectNoErrorPage,
  pageAs,
  submitAndAwaitAction,
} from "./support/helpers";

// Úkoly: více řešitelů a dohled (audit balík 05). Admin zakládá a upravuje,
// koncipient je řešitel / dohled, advokát řešitel. Praktikant se tu nepoužívá
// (je vyhrazen sériovému bloku v roles-and-permissions.spec.ts) a nikdo se
// nepřesouvá mezi týmy — seedovaný tým „Sporná agenda“ se jen čte.
// Testy v souboru na sebe navazují.
test.describe.configure({ mode: "serial" });

const taskMany = e2eName("vice-resitelu");
const taskSupervised = e2eName("dohled");
let taskSupervisedPath = "";

const ADVOKAT = E2E_USERS.lawyer.name;
const KONCIPIENT = E2E_USERS.trainee.name;
const PARTNER = E2E_USERS.partner.name;
const ADMIN = E2E_USERS.admin.name;

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

async function userId(email: string) {
  return withDb(async (db) => {
    const result = await db.query(`select id from users where email = $1`, [email]);
    return result.rows[0].id as string;
  });
}

function taskIdOf(path: string) {
  return path.split("/").pop() as string;
}

// Hodnota políčka detailu úkolu („Řešitelé“, „Dohled“, …): <p>štítek</p><p>hodnota</p>.
function infoValue(page: Page, label: string) {
  return page
    .locator("p", { hasText: new RegExp(`^${label}$`) })
    .locator("xpath=following-sibling::p[1]");
}

// Výběr osoby/týmu v TaskPeopleFields. Opakuje se, dokud React nepřevezme
// výběr (tlačítko „Přidat“ je do té doby neaktivní — ochrana před výběrem
// ještě před hydratací).
async function pick(
  scope: Locator | Page,
  picker: "Přidat řešitele nebo tým" | "Přidat osobu s dohledem",
  option: { label: string } | { value: string },
) {
  const select = scope.getByRole("combobox", { name: picker });
  const button = scope.getByRole("button", {
    name: picker === "Přidat řešitele nebo tým" ? "Přidat řešitele" : "Přidat dohled",
    exact: true,
  });
  await expect(async () => {
    await select.selectOption(option);
    await expect(button).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await button.click();
}

async function createTask(
  page: Page,
  title: string,
  people: { assignees: string[]; supervisors: string[]; deadline?: string },
) {
  await page.goto("/tasks");
  const form = page.locator("#new-task");
  await form.getByLabel("Název úkolu").fill(title);
  for (const name of people.assignees) {
    await pick(form, "Přidat řešitele nebo tým", { label: name });
    await expect(
      form.getByRole("button", { name: `Odebrat řešitele ${name}` }),
    ).toBeVisible();
  }
  for (const name of people.supervisors) {
    await pick(form, "Přidat osobu s dohledem", { label: name });
    await expect(
      form.getByRole("button", { name: `Odebrat dohled ${name}` }),
    ).toBeVisible();
  }
  if (people.deadline) {
    await form.getByLabel("Deadline", { exact: true }).fill(people.deadline);
  }
  await form.getByRole("button", { name: "Vytvořit úkol" }).click();
  await expect(page).toHaveURL(/\/tasks\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  return new URL(page.url()).pathname;
}

test("úkol má více řešitelů a dohled, detail i seznam je ukazují", async ({ page }) => {
  await createTask(page, taskMany, {
    assignees: [ADVOKAT, KONCIPIENT],
    supervisors: [PARTNER],
  });

  await expect(infoValue(page, "Řešitelé")).toHaveText(
    `${ADVOKAT} (hlavní), ${KONCIPIENT}`,
  );
  await expect(infoValue(page, "Dohled")).toHaveText(PARTNER);
  await expect(infoValue(page, "Zadavatel")).toHaveText(ADMIN);
  await expect(
    page.getByText("Dohled: vidí úkol, komentuje, mění status a dostává upozornění."),
  ).toBeVisible();

  await page.goto("/tasks");
  const row = page.getByRole("row").filter({ hasText: taskMany });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`${ADVOKAT}, ${KONCIPIENT}`);
});

test("výběr týmu přidá jeho členy jako řešitele bez reloadu", async ({ page }) => {
  await page.goto("/tasks");
  const form = page.locator("#new-task");
  await expect(form.getByText("Zatím bez řešitele.")).toBeVisible();
  const teamValue = await form
    .getByRole("combobox", { name: "Přidat řešitele nebo tým" })
    .locator("option", { hasText: "Sporná agenda" })
    .getAttribute("value");
  expect(teamValue).toMatch(/^team:/);
  await pick(form, "Přidat řešitele nebo tým", { value: teamValue as string });

  await expect(
    form.getByRole("button", { name: `Odebrat řešitele ${ADVOKAT}` }),
  ).toBeVisible();
  await expect(
    form.getByRole("button", { name: `Odebrat řešitele ${KONCIPIENT}` }),
  ).toBeVisible();
  await expect(form.getByText("Zatím bez řešitele.")).toHaveCount(0);
  // Řešitelé zmizí z výběru dohledu (jedna role na osobu).
  await expect(
    form
      .getByRole("combobox", { name: "Přidat osobu s dohledem" })
      .locator("option", { hasText: ADVOKAT }),
  ).toHaveCount(0);
  await expect(form.locator('input[type="hidden"][name="assigneeIds"]')).toHaveCount(2);
});

test("dohled úkol vidí, komentuje a mění status, ale neupravuje", async ({
  page,
  browser,
}) => {
  taskSupervisedPath = await createTask(page, taskSupervised, {
    assignees: [ADVOKAT],
    supervisors: [KONCIPIENT],
    // Nejstarší termín, aby byl úkol v dashboardovém widgetu (prvních 8) nahoře.
    deadline: "2001-01-01",
  });
  await expect(infoValue(page, "Dohled")).toHaveText(KONCIPIENT);

  const trainee = await pageAs(browser, "trainee");
  const koncipientId = await userId(E2E_USERS.trainee.email);
  let insertedWidget = false;
  try {
    await trainee.goto("/tasks/my?role=supervisor");
    await expect(trainee.getByRole("link", { name: taskSupervised })).toBeVisible();
    const row = trainee.getByRole("row").filter({ hasText: taskSupervised });
    await expect(row.getByText("Dohled", { exact: true })).toBeVisible();
    await trainee.goto("/tasks/my?role=assignee");
    await expect(
      trainee.getByRole("heading", { name: "Moje úkoly", level: 1 }),
    ).toBeVisible();
    await expect(trainee.getByRole("link", { name: taskSupervised })).toHaveCount(0);

    await trainee.goto(taskSupervisedPath);
    await expect(
      trainee.getByRole("heading", { name: taskSupervised, level: 1 }),
    ).toBeVisible();
    await expect(trainee.getByRole("link", { name: "Upravit úkol" })).toHaveCount(0);

    // Změna statusu — hned v historii, bez reloadu.
    const note = `${taskSupervised}-status`;
    await trainee.getByLabel("Nový status").selectOption("IN_PROGRESS");
    await trainee.getByLabel("Komentář ke změně").fill(note);
    await submitAndAwaitAction(
      trainee,
      trainee.getByRole("button", { name: "Uložit status" }),
    );
    await expectNoErrorPage(trainee);
    await expect(
      trainee.getByRole("row").filter({ hasText: note }).first(),
    ).toBeVisible();

    // Komentář — hned na detailu.
    const comment = `${taskSupervised}-komentar`;
    await trainee.getByLabel("Nový komentář").fill(comment);
    await submitAndAwaitAction(
      trainee,
      trainee.getByRole("button", { name: "Přidat komentář" }),
    );
    await expectNoErrorPage(trainee);
    await expect(trainee.getByText(comment)).toBeVisible();

    // Úprava úkolu je pro dohled nedostupná.
    await trainee.goto(`${taskSupervisedPath}/edit`);
    await expect(
      trainee.getByRole("heading", { name: "Tuto stránku jsme nenašli" }),
    ).toBeVisible();

    // Dashboard: widget „Moje úkoly“ ukazuje i úkol s dohledem. Widget není
    // ve výchozím rozložení — dočasně ho vložíme (jen E2E DB) a pak smažeme.
    insertedWidget = await withDb(async (db) => {
      const result = await db.query(
        `insert into "dashboardWidgets" (id, "userId", type, title, position, size, visible, config, "createdAt", "updatedAt")
         values ($1, $2, 'MY_TASKS_TABLE', 'Moje úkoly', 99, 'FULL', true, $3, now(), now())
         on conflict ("userId", type) do nothing
         returning id`,
        [
          e2eName("widget"),
          koncipientId,
          JSON.stringify({ columns: ["title", "assignedTo", "status", "deadline"] }),
        ],
      );
      return (result.rowCount ?? 0) > 0;
    });
    await trainee.goto("/dashboard");
    const widgetRow = trainee.getByRole("row").filter({ hasText: taskSupervised });
    await expect(widgetRow).toBeVisible();
    await expect(widgetRow).toContainText(ADVOKAT);
  } finally {
    if (insertedWidget) {
      await withDb((db) =>
        db.query(
          `delete from "dashboardWidgets" where "userId" = $1 and type = 'MY_TASKS_TABLE' and position = 99`,
          [koncipientId],
        ),
      );
    }
    await trainee.context().close();
  }
});

test("notifikace: řešitelé, dohled i zadavatel, nikdy aktér", async () => {
  const rows = await withDb(async (db) => {
    const result = await db.query(
      `select u.email, n.type from notifications n
         join users u on u.id = n."recipientUserId"
        where n."entityType" = 'Task' and n."entityId" = $1`,
      [taskIdOf(taskSupervisedPath)],
    );
    return result.rows as Array<{ email: string; type: string }>;
  });
  const has = (email: string, type: string) =>
    rows.filter((row) => row.email === email && row.type === type).length;

  // Nový úkol: řešitel i dohled (aktér admin ne).
  expect(has(E2E_USERS.lawyer.email, "TASK_CREATED")).toBe(1);
  expect(has(E2E_USERS.trainee.email, "TASK_CREATED")).toBe(1);
  expect(has(E2E_USERS.admin.email, "TASK_CREATED")).toBe(0);
  // Změna statusu a komentář od dohledu: řešitel a zadavatel/odpovědná osoba.
  for (const type of ["TASK_STATUS_CHANGED", "TASK_COMMENTED"]) {
    expect(has(E2E_USERS.lawyer.email, type)).toBe(1);
    expect(has(E2E_USERS.admin.email, type)).toBe(1);
    expect(has(E2E_USERS.trainee.email, type)).toBe(0);
  }
});

test("úprava lidí na úkolu se auditně zapíše a hlavní řešitel je i v assignedToId", async ({
  page,
}) => {
  await page.goto(`${taskSupervisedPath}/edit`);
  await expect(page.getByRole("heading", { name: "Upravit úkol", level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Odebrat dohled ${KONCIPIENT}` }),
  ).toBeVisible();
  // Až po hydrataci (klik na „×“ je klientská akce).
  await expect(async () => {
    await page.getByRole("button", { name: `Odebrat dohled ${KONCIPIENT}` }).click({
      timeout: 1_000,
    });
    await expect(page.getByText("Bez dohledu.")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await pick(page, "Přidat řešitele nebo tým", { label: PARTNER });
  await page
    .getByRole("button", { name: `Nastavit ${PARTNER} jako hlavního řešitele` })
    .click();
  await expect(
    page.getByRole("button", { name: `Nastavit ${ADVOKAT} jako hlavního řešitele` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Uložit úkol" }).click();
  await expect(page).toHaveURL(new RegExp(`${taskSupervisedPath}$`));

  await expect(infoValue(page, "Řešitelé")).toHaveText(
    `${PARTNER} (hlavní), ${ADVOKAT}`,
  );
  await expect(infoValue(page, "Dohled")).toHaveText("—");

  const taskId = taskIdOf(taskSupervisedPath);
  const partnerId = await userId(E2E_USERS.partner.email);
  await withDb(async (db) => {
    const audit = await db.query(
      `select action, "newValue", "oldValue" from "auditLogs"
        where "entityType" = 'TaskAssignee' and "entityId" = $1`,
      [taskId],
    );
    const actions = audit.rows.map((row) => row.action as string);
    expect(actions).toContain("ASSIGN");
    expect(actions).toContain("REMOVE");
    const removed = audit.rows.find((row) => row.action === "REMOVE");
    expect(removed?.oldValue).toMatchObject({ userName: KONCIPIENT, role: "SUPERVISOR" });

    const task = await db.query(`select "assignedToId" from tasks where id = $1`, [taskId]);
    expect(task.rows[0].assignedToId).toBe(partnerId);
    const people = await db.query(
      `select u.name, a.role from "taskAssignees" a join users u on u.id = a."userId"
        where a."taskId" = $1 order by u.name`,
      [taskId],
    );
    expect(people.rows).toEqual([
      { name: ADVOKAT, role: "ASSIGNEE" },
      { name: PARTNER, role: "ASSIGNEE" },
    ]);
  });

  await page.goto("/audit-log");
  await page.getByLabel("Entita").selectOption({ label: "Lidé na úkolu" });
  await page.getByRole("button", { name: "Filtrovat" }).click();
  await expect(page).toHaveURL(/entityType=TaskAssignee/);
  await expect(page.getByRole("row").filter({ hasText: "Přiřazení" }).first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Odebrání" }).first()).toBeVisible();
});

test("filtry řešitele a dohledu a export ukazují všechny lidi", async ({ page }) => {
  const koncipientId = await userId(E2E_USERS.trainee.email);
  const partnerId = await userId(E2E_USERS.partner.email);

  // Koncipient je na prvním úkolu „další“ (ne hlavní) řešitel.
  await page.goto(`/tasks?assignedToId=${koncipientId}`);
  await expect(page.getByRole("link", { name: taskMany })).toBeVisible();
  await expect(page.getByRole("link", { name: taskSupervised })).toHaveCount(0);

  await page.goto(`/tasks?supervisorId=${partnerId}`);
  await expect(page.getByRole("combobox", { name: "Dohled", exact: true })).toHaveValue(
    partnerId,
  );
  await expect(page.getByRole("link", { name: taskMany })).toBeVisible();
  await expect(page.getByRole("link", { name: taskSupervised })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Zrušit filtry" })).toBeVisible();

  // Stažení přes fetch v prohlížeči (session cookie je Secure, APIRequest ji
  // na http://127.0.0.1 nepošle).
  const { status, csv } = await page.evaluate(async () => {
    const response = await fetch("/reports/tasks/export?format=csv");
    return { status: response.status, csv: await response.text() };
  });
  expect(status).toBe(200);
  const [header] = csv.replace(/^﻿/, "").split(/\r?\n/);
  expect(header).toContain("Řešitelé");
  expect(header).toContain("Dohled");
  const line = csv.split(/\r?\n/).find((item) => item.includes(taskMany));
  expect(line).toBeDefined();
  expect(line).toContain(`${ADVOKAT}, ${KONCIPIENT}`);
  expect(line).toContain(PARTNER);
});

test("výběr úkolu ve výkazu nabízí nahoře „Moje úkoly“", async ({ browser }) => {
  const trainee = await pageAs(browser, "trainee");
  try {
    await trainee.goto("/work-logs");
    await trainee.getByRole("link", { name: "Nový výkaz" }).click();
    const dialog = trainee.getByRole("dialog", { name: "Nový výkaz práce" });
    await expect(dialog).toBeVisible();
    const taskSelect = dialog.getByRole("combobox", { name: "Úkol", exact: true });
    await expect(
      taskSelect.locator('optgroup[label="Moje úkoly"] option', { hasText: taskMany }),
    ).toHaveCount(1);
    await expect(taskSelect.locator('optgroup[label="Ostatní úkoly"]')).toHaveCount(1);
    // Úkol, ze kterého byl koncipient odebrán, už mezi jeho úkoly není.
    await expect(
      taskSelect.locator('optgroup[label="Moje úkoly"] option', {
        hasText: taskSupervised,
      }),
    ).toHaveCount(0);
  } finally {
    await trainee.context().close();
  }
});
